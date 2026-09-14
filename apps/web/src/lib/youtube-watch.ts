/**
 * Copyright (c) VA360 LABS S.L.
 * SPDX-License-Identifier: LicenseRef-Didacta-Sustainable-Use
 */

/**
 * Medición REAL del visionado en un iframe de YouTube sin cargar su script
 * (`iframe_api`), que la CSP de producción no permite. El iframe embebido con
 * `enablejsapi=1` habla por `postMessage`: tras un handshake `listening`, el
 * player envía `infoDelivery` con `currentTime`, `duration` y `playerState`
 * (0 = terminado). Es el mismo canal que usa la IFrame API por debajo.
 *
 * Este módulo es PURO (parseo de mensajes) para poder testearlo; el hook que
 * escucha `window` vive en VideoEmbed.
 */

export const YOUTUBE_ORIGIN = 'https://www.youtube.com';

/** YouTube `playerState`: 0 = ended. */
export const YT_STATE_ENDED = 0;

export interface YouTubeInfo {
  currentTime?: number;
  duration?: number;
  playerState?: number;
}

/** Mensaje de handshake: pide al player que empiece a enviar `infoDelivery`. */
export function listeningMessage(id = 1): string {
  return JSON.stringify({ event: 'listening', id, channel: 'widget' });
}

/**
 * Extrae tiempo/duración/estado de un mensaje del iframe. Devuelve null si el
 * mensaje no es del player o no trae nada útil. Acepta string JSON u objeto.
 */
export function parseYouTubeInfo(raw: unknown): YouTubeInfo | null {
  let data: unknown = raw;
  if (typeof raw === 'string') {
    try {
      data = JSON.parse(raw);
    } catch {
      return null;
    }
  }
  if (!data || typeof data !== 'object') return null;
  const msg = data as { event?: unknown; info?: unknown };
  if (msg.event === 'infoDelivery' && msg.info && typeof msg.info === 'object') {
    const info = msg.info as Record<string, unknown>;
    const out: YouTubeInfo = {};
    if (typeof info['currentTime'] === 'number') out.currentTime = info['currentTime'];
    if (typeof info['duration'] === 'number' && info['duration'] > 0)
      out.duration = info['duration'];
    if (typeof info['playerState'] === 'number') out.playerState = info['playerState'];
    return Object.keys(out).length ? out : null;
  }
  if (msg.event === 'onStateChange' && typeof msg.info === 'number') {
    return { playerState: msg.info };
  }
  return null;
}

/** Añade `enablejsapi=1` (y el origin) a la URL del embed para habilitar postMessage. */
export function withJsApi(embedUrl: string, origin: string): string {
  const sep = embedUrl.includes('?') ? '&' : '?';
  return `${embedUrl}${sep}enablejsapi=1&origin=${encodeURIComponent(origin)}`;
}
