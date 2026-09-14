/**
 * Copyright (c) VA360 LABS S.L.
 * SPDX-License-Identifier: LicenseRef-Didacta-Sustainable-Use
 */

/**
 * Detección del ORIGEN de un vídeo de lección a partir de su `content.videoUrl`
 * (auto-transcripción, LMS-90.D).
 *
 * Una lección VIDEO guarda una única `videoUrl` que puede ser de dos naturalezas
 * y cada una se transcribe distinto:
 *
 *   - `youtube`  → embed/enlace de YouTube. Se transcribe GRATIS bajando los
 *                  subtítulos (captions) que YouTube ya autogenera. No toca IA.
 *   - `storage`  → mp4/webm subido nativamente por el formador. Vive en S3/MinIO
 *                  bajo el playbackUrl interno `/api/v1/storage/video/<key>`
 *                  (ver VideoUploadController). Se transcribe con Whisper sobre
 *                  el audio (URL firmada del objeto).
 *   - `unknown`  → cualquier otro embed externo (Vimeo, Loom, un iframe suelto…):
 *                  no sabemos bajar su pista, no es transcribible por aquí.
 *
 * Función PURA: solo mira el string. La resolución de la URL firmada (storage) o
 * la bajada de captions (youtube) las hace el bridge con el string que sale de
 * aquí.
 */

export type VideoSource =
  | { kind: 'youtube'; videoId: string }
  | { kind: 'storage'; key: string }
  | { kind: 'unknown' };

/** Prefijo del playbackUrl que emite VideoUploadController para los mp4 subidos. */
const STORAGE_PLAYBACK_PREFIX = '/api/v1/storage/video/';

/**
 * IDs de vídeo de YouTube son 11 chars de [A-Za-z0-9_-]. Validarlo evita tomar
 * como id basura de la query (playlists, params sueltos).
 */
const YT_ID = /^[A-Za-z0-9_-]{11}$/;

export function detectVideoSource(videoUrl: unknown): VideoSource {
  if (typeof videoUrl !== 'string') return { kind: 'unknown' };
  const url = videoUrl.trim();
  if (!url) return { kind: 'unknown' };

  // ── Storage nativo ────────────────────────────────────────────────────
  // El playbackUrl puede venir relativo (`/api/v1/storage/video/…`) o absoluto
  // (`https://host/api/v1/storage/video/…`). Nos quedamos con la key = lo que
  // sigue al prefijo, que es lo que firma el storage.
  const idx = url.indexOf(STORAGE_PLAYBACK_PREFIX);
  if (idx !== -1) {
    const key = url
      .slice(idx + STORAGE_PLAYBACK_PREFIX.length)
      .split('?')[0]!
      .split('#')[0]!;
    if (key) return { kind: 'storage', key };
    return { kind: 'unknown' };
  }

  // ── YouTube ───────────────────────────────────────────────────────────
  const videoId = parseYoutubeId(url);
  if (videoId) return { kind: 'youtube', videoId };

  return { kind: 'unknown' };
}

/**
 * Extrae el id de vídeo de las formas en que YouTube reparte enlaces:
 *   - youtube.com/watch?v=ID
 *   - youtu.be/ID
 *   - youtube.com/embed/ID   (lo que pega un iframe)
 *   - youtube.com/shorts/ID
 *   - youtube.com/live/ID
 * Devuelve null si no es YouTube o el id no valida. PURA.
 */
export function parseYoutubeId(raw: string): string | null {
  let host: string;
  let pathname: string;
  let search: URLSearchParams;
  try {
    const u = new URL(raw);
    host = u.hostname.replace(/^www\./, '').toLowerCase();
    pathname = u.pathname;
    search = u.searchParams;
  } catch {
    return null;
  }

  const isYoutube =
    host === 'youtube.com' || host === 'm.youtube.com' || host === 'youtube-nocookie.com';
  const isShort = host === 'youtu.be';
  if (!isYoutube && !isShort) return null;

  if (isShort) {
    const id = pathname.slice(1).split('/')[0] ?? '';
    return YT_ID.test(id) ? id : null;
  }

  // youtube.com/watch?v=ID
  const v = search.get('v');
  if (v && YT_ID.test(v)) return v;

  // youtube.com/{embed,shorts,live,v}/ID
  const m = pathname.match(/^\/(?:embed|shorts|live|v)\/([^/?#]+)/);
  if (m && YT_ID.test(m[1]!)) return m[1]!;

  return null;
}
