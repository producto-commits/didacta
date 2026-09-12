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

/** PUT directo al storage (S3/MinIO) con barra de progreso vía XHR. */
function putWithProgress(
  url: string,
  file: File,
  contentType: string,
  onProgress?: (pct: number) => void,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('PUT', url, true);
    // El content-type va firmado en la URL: hay que mandarlo idéntico o falla la firma.
    xhr.setRequestHeader('Content-Type', contentType);
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable && onProgress) onProgress(Math.round((e.loaded / e.total) * 100));
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) resolve();
      else
        reject(
          new VideoUploadError('upload-failed', `El storage rechazó la subida (${xhr.status}).`),
        );
    };
    xhr.onerror = () =>
      reject(new VideoUploadError('network', 'Error de red subiendo el vídeo al storage.'));
    xhr.send(file);
  });
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

  const presign = await apiFetch<PresignResponse>(
    '/api/v1/storage/video/presign',
    {
      method: 'POST',
      body: JSON.stringify({ filename: file.name, contentType, sizeBytes: file.size }),
    },
    withAuth(),
  );

  await putWithProgress(presign.uploadUrl, file, contentType, onProgress);
  return presign.playbackUrl;
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
