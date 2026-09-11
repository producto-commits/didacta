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
