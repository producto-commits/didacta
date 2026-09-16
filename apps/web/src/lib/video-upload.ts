'use client';

/**
 * Copyright (c) VA360 LABS S.L.
 * SPDX-License-Identifier: LicenseRef-Didacta-Sustainable-Use
 */

import { ApiHttpError, apiFetch } from './api-client';
import { authStorage } from './auth-storage';

/** MIME de vídeo admitidos (espejo del allowlist del backend). */
const ALLOWED_VIDEO_TYPES = new Set(['video/mp4', 'video/webm']);

/** Fallback extensión → MIME cuando el navegador no reporta `file.type`. */
const EXT_TO_MIME: Record<string, string> = {
  mp4: 'video/mp4',
  webm: 'video/webm',
};

/** Tope de cliente (el backend valida el suyo). 5 GiB. */
const MAX_VIDEO_BYTES = 5 * 1024 * 1024 * 1024;

export class VideoUploadError extends Error {
  constructor(
    public readonly reason: 'unsupported-type' | 'too-large' | 'upload-failed' | 'network',
    message: string,
    /** Código HTTP del storage cuando `reason === 'upload-failed'`. */
    public readonly status?: number,
  ) {
    super(message);
    this.name = 'VideoUploadError';
  }
}

function resolveVideoContentType(file: File): string | null {
  if (file.type && ALLOWED_VIDEO_TYPES.has(file.type)) return file.type;
  const ext = file.name.split('.').pop()?.toLowerCase() ?? '';
  return EXT_TO_MIME[ext] ?? null;
}

function withAuth(): string {
  const token = authStorage.getAccessToken();
  if (!token)
    throw new ApiHttpError({ message: 'Sesión expirada', status: 401, code: 'sessionExpired' });
  return token;
}

interface PresignResponse {
  uploadUrl: string;
  key: string;
  playbackUrl: string;
}

/**
 * A partir de este tamaño el vídeo se sube por PARTES (multipart) en vez de un
 * único PUT. Un PUT gigante detrás de un proxy (Traefik) se corta por límite de
 * tamaño o timeout; troceado, cada parte es una petición corta y reintentar
 * afecta solo a la parte fallida. 8 MiB = el tamaño de parte que fija el backend.
 */
const MULTIPART_THRESHOLD = 8 * 1024 * 1024;

/** Reintentos por parte/PUT ante un fallo transitorio de red o proxy. */
const MAX_PART_RETRIES = 3;

/**
 * PUT de un blob (fichero completo o una parte) al storage con progreso.
 * `contentType` solo se manda cuando la URL lo firmó (subida simple); en las
 * partes multipart va vacío porque la URL de la parte NO firma Content-Type.
 * `onLoaded` reporta bytes subidos de ESTE PUT (para agregar el progreso total).
 */
function putBlob(
  url: string,
  body: Blob,
  contentType: string | null,
  onLoaded?: (loaded: number) => void,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('PUT', url, true);
    if (contentType) xhr.setRequestHeader('Content-Type', contentType);
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable && onLoaded) onLoaded(e.loaded);
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) resolve();
      else
        reject(
          new VideoUploadError(
            'upload-failed',
            `El storage rechazó la subida (${xhr.status}).`,
            xhr.status,
          ),
        );
    };
    xhr.onerror = () =>
      reject(new VideoUploadError('network', 'Error de red subiendo el vídeo al storage.'));
    xhr.send(body);
  });
}

/** PUT con reintentos ante fallos transitorios (red o 5xx del proxy), no ante 4xx. */
async function putBlobRetrying(
  url: string,
  body: Blob,
  contentType: string | null,
  onLoaded?: (loaded: number) => void,
): Promise<void> {
  let lastErr: unknown;
  for (let attempt = 1; attempt <= MAX_PART_RETRIES; attempt++) {
    try {
      await putBlob(url, body, contentType, onLoaded);
      return;
    } catch (e) {
      lastErr = e;
      // Un 4xx (firma inválida, permiso, etc.) no se arregla reintentando.
      const transient =
        e instanceof VideoUploadError &&
        (e.reason === 'network' || (e.status !== undefined && e.status >= 500));
      if (!transient) throw e;
      await new Promise((r) => setTimeout(r, 500 * attempt));
    }
  }
  throw lastErr instanceof Error
    ? lastErr
    : new VideoUploadError('network', 'No se pudo subir el vídeo tras varios intentos.');
}

/**
 * Sube un vídeo de clase desde el computador: pide una URL firmada, hace PUT
 * directo al storage de objetos (sin pasar por la API) y devuelve la URL de
 * reproducción estable que se guarda como `videoUrl` de la lección.
 */
export async function uploadLessonVideo(
  file: File,
  onProgress?: (pct: number) => void,
): Promise<string> {
  const contentType = resolveVideoContentType(file);
  if (!contentType) {
    throw new VideoUploadError('unsupported-type', 'Solo se admiten vídeos MP4 o WebM.');
  }
  if (file.size > MAX_VIDEO_BYTES) {
    throw new VideoUploadError('too-large', 'El vídeo supera el tamaño máximo (5 GB).');
  }

  // Ficheros pequeños: un único PUT firmado (camino simple y probado).
  if (file.size <= MULTIPART_THRESHOLD) {
    const presign = await apiFetch<PresignResponse>(
      '/api/v1/storage/video/presign',
      {
        method: 'POST',
        body: JSON.stringify({ filename: file.name, contentType, sizeBytes: file.size }),
      },
      withAuth(),
    );
    await putBlobRetrying(presign.uploadUrl, file, contentType, (loaded) =>
      onProgress?.(Math.round((loaded / file.size) * 100)),
    );
    return presign.playbackUrl;
  }

  // Ficheros grandes: subida por partes (multipart).
  return uploadLessonVideoMultipart(file, contentType, onProgress);
}

interface MultipartCreateResponse {
  key: string;
  uploadId: string;
  playbackUrl: string;
  partSize: number;
}

/**
 * Sube el vídeo en partes: crea la subida, sube cada trozo a su URL firmada (con
 * reintento), y la cierra. El backend arma la lista de partes leyéndolas del
 * storage, así el navegador no necesita leer cabeceras ETag. Si algo falla, se
 * aborta la subida (mejor esfuerzo) para no dejar trozos huérfanos en el bucket.
 */
async function uploadLessonVideoMultipart(
  file: File,
  contentType: string,
  onProgress?: (pct: number) => void,
): Promise<string> {
  const created = await apiFetch<MultipartCreateResponse>(
    '/api/v1/storage/video/multipart/create',
    {
      method: 'POST',
      body: JSON.stringify({ filename: file.name, contentType, sizeBytes: file.size }),
    },
    withAuth(),
  );

  const partSize = created.partSize > 0 ? created.partSize : MULTIPART_THRESHOLD;
  const partCount = Math.max(1, Math.ceil(file.size / partSize));
  // Progreso agregado: bytes ya confirmados + lo que lleva la parte en curso.
  let uploadedConfirmed = 0;
  const report = (currentPartLoaded: number) => {
    const pct = Math.min(
      99,
      Math.round(((uploadedConfirmed + currentPartLoaded) / file.size) * 100),
    );
    onProgress?.(pct);
  };

  try {
    for (let partNumber = 1; partNumber <= partCount; partNumber++) {
      const start = (partNumber - 1) * partSize;
      const chunk = file.slice(start, Math.min(start + partSize, file.size));
      const { url } = await apiFetch<{ url: string }>(
        '/api/v1/storage/video/multipart/part-url',
        {
          method: 'POST',
          body: JSON.stringify({ key: created.key, uploadId: created.uploadId, partNumber }),
        },
        withAuth(),
      );
      // La URL de la parte NO firma Content-Type → no se manda.
      await putBlobRetrying(url, chunk, null, (loaded) => report(loaded));
      uploadedConfirmed += chunk.size;
    }

    await apiFetch(
      '/api/v1/storage/video/multipart/complete',
      {
        method: 'POST',
        body: JSON.stringify({ key: created.key, uploadId: created.uploadId }),
      },
      withAuth(),
    );
    onProgress?.(100);
    return created.playbackUrl;
  } catch (err) {
    // Limpieza best-effort: descartar los trozos ya subidos.
    try {
      await apiFetch(
        '/api/v1/storage/video/multipart/abort',
        {
          method: 'POST',
          body: JSON.stringify({ key: created.key, uploadId: created.uploadId }),
        },
        withAuth(),
      );
    } catch {
      /* si el abort falla, S3 caduca la subida incompleta por su cuenta */
    }
    throw err;
  }
}

/**
 * Captura un fotograma del vídeo (en el navegador) para usarlo como miniatura /
 * poster de la lección, y lo devuelve como data URI JPEG comprimido (~640px de
 * ancho). Así el reproductor muestra una portada en vez de un rectángulo negro
 * antes de dar play. No sube nada: el poster va inline en el contenido de la
 * lección (unos KB). Devuelve null si el navegador no puede decodificar el
 * fotograma (formato raro, políticas, etc.) — en ese caso simplemente no hay
 * poster y no se rompe nada.
 */
export function captureVideoPoster(file: File): Promise<string | null> {
  return new Promise((resolve) => {
    let settled = false;
    const finish = (v: string | null) => {
      if (settled) return;
      settled = true;
      try {
        video.removeAttribute('src');
        URL.revokeObjectURL(objectUrl);
      } catch {
        /* noop */
      }
      resolve(v);
    };

    const objectUrl = URL.createObjectURL(file);
    const video = document.createElement('video');
    video.muted = true;
    video.preload = 'metadata';
    video.crossOrigin = 'anonymous';
    video.src = objectUrl;

    // Si algo se cuelga, no bloqueamos la subida indefinidamente.
    const timeout = setTimeout(() => finish(null), 8000);

    video.onloadedmetadata = () => {
      // Un punto temprano pero no el frame 0 (suele ser negro): 1s o el 10%.
      const target = Math.min(1, (video.duration || 2) * 0.1);
      const onSeeked = () => {
        try {
          const maxW = 640;
          const scale = video.videoWidth > maxW ? maxW / video.videoWidth : 1;
          const canvas = document.createElement('canvas');
          canvas.width = Math.max(1, Math.round(video.videoWidth * scale));
          canvas.height = Math.max(1, Math.round(video.videoHeight * scale));
          const ctx = canvas.getContext('2d');
          if (!ctx) {
            clearTimeout(timeout);
            return finish(null);
          }
          ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
          const dataUri = canvas.toDataURL('image/jpeg', 0.7);
          clearTimeout(timeout);
          finish(dataUri.startsWith('data:image/jpeg') ? dataUri : null);
        } catch {
          clearTimeout(timeout);
          finish(null);
        }
      };
      video.onseeked = onSeeked;
      try {
        video.currentTime = target;
      } catch {
        clearTimeout(timeout);
        finish(null);
      }
    };
    video.onerror = () => {
      clearTimeout(timeout);
      finish(null);
    };
  });
}
