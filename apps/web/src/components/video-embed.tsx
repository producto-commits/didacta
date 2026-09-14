'use client';

/**
 * Copyright (c) VA360 LABS S.L.
 * SPDX-License-Identifier: LicenseRef-Didacta-Sustainable-Use
 */

import { useTranslations } from 'next-intl';
import { useEffect, useRef, useState } from 'react';
import {
  bunnyEmbedUrl,
  formatSeconds,
  parseBunny,
  parseResources,
  parseYouTubeId,
  parseYouTubeStartSeconds,
  youTubeEmbedUrl,
} from '@/lib/video';
import { useBunnyWatch, type WatchReport } from '@/lib/use-bunny-watch';
import {
  listeningMessage,
  parseYouTubeInfo,
  withJsApi,
  YOUTUBE_ORIGIN,
  YT_STATE_ENDED,
} from '@/lib/youtube-watch';

interface Props {
  url: string;
  title: string;
  /**
   * Texto libre de recursos/capítulos. Las líneas `MM:SS - Texto` se vuelven
   * capítulos clicables que hacen seek en el vídeo; el resto, viñetas.
   */
  resources?: string;
  /**
   * Segundo en el que arrancar (reanudar donde lo dejó el alumno). Aplica a
   * `<video>` directo (seek en `loadedmetadata`) y a Bunny Stream (parámetro
   * `t` del embed). No aplica a YouTube.
   */
  resumeAt?: number;
  /** Oculta la lista de recursos aunque `resources` traiga contenido. */
  hideResources?: boolean;
  /**
   * Reporte de visionado REAL. Hoy solo se mide en Bunny Stream (vía Player.js);
   * en otros proveedores no se invoca. Si no se pasa, no se mide nada.
   */
  onWatch?: (report: WatchReport) => void;
  /** Habilita/pausa la medición (p.ej. se apaga al completar la lección). */
  watchEnabled?: boolean;
  /**
   * Imagen de portada (poster) para el `<video>` directo (mp4/webm): se muestra
   * antes de dar play, en vez del rectángulo negro. Puede ser un data URI.
   */
  poster?: string;
  /**
   * % del vídeo VISTO (0–100), para `<video>` self-hosted (mp4/webm). Se calcula
   * como la posición máxima alcanzada / duración, y alimenta la barra de
   * progreso de la lección. No aplica a YouTube (no medible sin su API).
   */
  onVideoProgress?: (percent: number) => void;
  /**
   * Se dispara UNA vez cuando faltan ≤30s para el final del vídeo self-hosted:
   * la lección se auto-marca como completada (estilo Skool). No aplica a YouTube.
   */
  onNearEnd?: () => void;
  /**
   * El vídeo llegó al FINAL (100 % real). Self-hosted vía `ended`; YouTube vía
   * postMessage (playerState 0). Es lo que exige un reto para dar el video por
   * visto. Bunny no lo emite (usa `onWatch.ended`).
   */
  onEnded?: () => void;
}

/**
 * Player de vídeo unificado: detecta YouTube, Bunny Stream o fichero directo
 * (mp4/webm/HLS) y lo embebe. Soporta deep-links a un punto del vídeo desde
 * los capítulos `MM:SS - Texto` de los recursos: en `<video>` hace seek en
 * sitio; en iframes (YouTube/Bunny) re-monta el embed arrancando en ese
 * segundo con autoplay.
 */
export function VideoEmbed({
  url,
  title,
  resources,
  resumeAt = 0,
  hideResources,
  onWatch,
  watchEnabled = true,
  poster,
  onVideoProgress,
  onNearEnd,
  onEnded,
}: Props) {
  const t = useTranslations('playersContenido');
  // Tracking del <video> self-hosted: posición máxima vista, delta reproducido
  // y throttle del reporte al backend.
  const lastTimeRef = useRef(0);
  const maxWatchedRef = useRef(0);
  const accumDeltaRef = useRef(0);
  const nearEndFiredRef = useRef(false);
  // `seek` cambia al pulsar un capítulo; `nonce` fuerza el re-mount del iframe.
  const [seek, setSeek] = useState<{ seconds: number; nonce: number } | null>(null);
  const nonceRef = useRef(0);
  const videoRef = useRef<HTMLVideoElement>(null);
  const bunnyIframeRef = useRef<HTMLIFrameElement>(null);
  const ytIframeRef = useRef<HTMLIFrameElement>(null);

  const bunny = parseBunny(url);
  const ytId = bunny ? null : parseYouTubeId(url);

  // YouTube: visionado REAL por postMessage con el iframe (`enablejsapi=1`),
  // sin cargar el script de YouTube (la CSP no lo permite). Tras el handshake
  // `listening`, el player manda `infoDelivery` con currentTime/duration y
  // playerState (0 = terminado). Ver lib/youtube-watch.ts.
  const ytTrack = Boolean(ytId && watchEnabled && (onVideoProgress || onNearEnd || onEnded));
  useEffect(() => {
    if (!ytTrack) return;
    const iframe = ytIframeRef.current;
    if (!iframe) return;
    let maxTime = 0;
    let duration = 0;
    let endedFired = false;
    const send = (msg: string) => iframe.contentWindow?.postMessage(msg, YOUTUBE_ORIGIN);
    const onMessage = (e: MessageEvent) => {
      if (e.origin !== YOUTUBE_ORIGIN || e.source !== iframe.contentWindow) return;
      const info = parseYouTubeInfo(e.data);
      if (!info) return;
      if (info.duration) duration = info.duration;
      if (typeof info.currentTime === 'number') maxTime = Math.max(maxTime, info.currentTime);
      if (duration > 0) {
        onVideoProgress?.(Math.min(100, (maxTime / duration) * 100));
        if (!nearEndFiredRef.current && duration > 30 && maxTime >= duration - 30) {
          nearEndFiredRef.current = true;
          onNearEnd?.();
        }
      }
      if (info.playerState === YT_STATE_ENDED && !endedFired) {
        endedFired = true;
        onVideoProgress?.(100);
        onEnded?.();
      }
    };
    window.addEventListener('message', onMessage);
    const handshake = () => send(listeningMessage());
    iframe.addEventListener('load', handshake);
    handshake();
    // El iframe puede no estar escuchando aún: se repite el handshake un rato.
    const retry = window.setInterval(handshake, 1500);
    const stopRetry = window.setTimeout(() => window.clearInterval(retry), 15000);
    return () => {
      window.removeEventListener('message', onMessage);
      iframe.removeEventListener('load', handshake);
      window.clearInterval(retry);
      window.clearTimeout(stopRetry);
    };
    // Los callbacks se leen por cierre a propósito; el disparador es el iframe.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ytTrack, ytId, seek?.nonce]);

  // Medición de visionado real (solo Bunny por ahora). El hook no hace nada si
  // no hay callback, está deshabilitado o no es un iframe de Bunny.
  useBunnyWatch({
    iframeRef: bunnyIframeRef,
    onReport: onWatch ?? (() => {}),
    enabled: Boolean(bunny && onWatch && watchEnabled),
    remountKey: seek?.nonce ?? 0,
  });

  function handleSeek(seconds: number) {
    const v = videoRef.current;
    if (v) {
      // <video> directo: seek en sitio, sin recargar.
      v.currentTime = seconds;
      void v.play().catch(() => {});
      v.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return;
    }
    // iframe (YouTube/Bunny): re-montar el embed arrancando en ese segundo.
    nonceRef.current += 1;
    setSeek({ seconds, nonce: nonceRef.current });
  }

  let player: React.ReactNode;
  if (!url) {
    player = (
      <div className="rounded-lg border border-dashed border-border-strong bg-surface-2 px-6 py-12 text-center text-sm text-text-muted">
        {t('video.missing')}
      </div>
    );
  } else if (bunny) {
    player = (
      <div className="aspect-video w-full overflow-hidden rounded-lg border border-border bg-black">
        <iframe
          key={seek?.nonce ?? 'init'}
          ref={bunnyIframeRef}
          src={bunnyEmbedUrl(bunny, {
            // Al saltar a un capítulo manda `seek`; si no, arranca en la posición
            // de reanudación guardada (si la hay). El player de Bunny queda
            // pausado (autoplay solo en el salto de capítulo), así que si la
            // posición llega tarde solo re-sitúa el vídeo, sin interrumpir.
            startSeconds: seek?.seconds ?? (resumeAt > 0 ? resumeAt : undefined),
            autoplay: seek != null,
          })}
          title={title}
          loading="lazy"
          className="h-full w-full"
          allow="accelerometer; autoplay; encrypted-media; gyroscope; picture-in-picture; fullscreen"
          allowFullScreen
        />
      </div>
    );
  } else if (ytId) {
    const start = seek?.seconds ?? parseYouTubeStartSeconds(url);
    const base = youTubeEmbedUrl(ytId, start ? { startSeconds: start } : {});
    const plain = seek ? `${base}&autoplay=1` : base;
    const src = ytTrack
      ? withJsApi(plain, typeof window !== 'undefined' ? window.location.origin : '')
      : plain;
    player = (
      <div className="aspect-video w-full overflow-hidden rounded-lg border border-border bg-black">
        <iframe
          ref={ytIframeRef}
          key={seek?.nonce ?? 'init'}
          src={src}
          title={title}
          className="h-full w-full"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          allowFullScreen
        />
      </div>
    );
  } else {
    player = (
      <video
        ref={videoRef}
        controls
        preload="metadata"
        poster={poster || undefined}
        className="w-full rounded-lg border border-border bg-black"
        // eslint-disable-next-line jsx-a11y/media-has-caption
        src={url}
        onLoadedMetadata={(e) => {
          const v = e.currentTarget;
          if (resumeAt > 0 && resumeAt < v.duration) v.currentTime = resumeAt;
          nearEndFiredRef.current = false;
          lastTimeRef.current = v.currentTime;
          maxWatchedRef.current = Math.max(maxWatchedRef.current, v.currentTime);
          if (v.duration > 0) {
            onVideoProgress?.(Math.min(100, (maxWatchedRef.current / v.duration) * 100));
          }
        }}
        onTimeUpdate={(e) => {
          const v = e.currentTarget;
          const delta = v.currentTime - lastTimeRef.current;
          lastTimeRef.current = v.currentTime;
          // Solo cuenta reproducción REAL (delta pequeño y positivo); ignora seeks/saltos.
          if (delta > 0 && delta < 2) {
            accumDeltaRef.current += delta;
            if (v.currentTime > maxWatchedRef.current) maxWatchedRef.current = v.currentTime;
            if (v.duration > 0) {
              onVideoProgress?.(Math.min(100, (maxWatchedRef.current / v.duration) * 100));
            }
          }
          // Reporta al backend como mucho cada ~10s de reproducción acumulada.
          if (watchEnabled && accumDeltaRef.current >= 10) {
            onWatch?.({
              positionSeconds: v.currentTime,
              watchedSecondsDelta: accumDeltaRef.current,
              maxPositionSeconds: maxWatchedRef.current,
              durationSeconds: v.duration || 0,
              ended: false,
            });
            accumDeltaRef.current = 0;
          }
          // Auto-completar (estilo Skool): cuando faltan ≤30s para el final.
          if (!nearEndFiredRef.current && v.duration > 30 && v.currentTime >= v.duration - 30) {
            nearEndFiredRef.current = true;
            onNearEnd?.();
          }
        }}
        onPause={(e) => {
          const v = e.currentTarget;
          if (watchEnabled && accumDeltaRef.current > 0) {
            onWatch?.({
              positionSeconds: v.currentTime,
              watchedSecondsDelta: accumDeltaRef.current,
              maxPositionSeconds: maxWatchedRef.current,
              durationSeconds: v.duration || 0,
              ended: false,
            });
            accumDeltaRef.current = 0;
          }
        }}
        onEnded={(e) => {
          const v = e.currentTarget;
          onVideoProgress?.(100);
          onEnded?.();
          if (watchEnabled) {
            onWatch?.({
              positionSeconds: v.duration || v.currentTime,
              watchedSecondsDelta: accumDeltaRef.current,
              maxPositionSeconds: maxWatchedRef.current,
              durationSeconds: v.duration || 0,
              ended: true,
            });
          }
          accumDeltaRef.current = 0;
        }}
      />
    );
  }

  const lines = !hideResources && resources ? parseResources(resources) : [];
  const chapters = lines.flatMap((l) => (l.kind === 'chapter' ? [l] : []));
  const bullets = lines.flatMap((l) => (l.kind === 'text' ? [l] : []));

  return (
    <div>
      {player}

      {(chapters.length > 0 || bullets.length > 0) && (
        // Espacio generoso entre el vídeo y los recursos (pedido del cliente).
        <div className="mt-8 space-y-6">
          {chapters.length > 0 && (
            <div className="space-y-1.5">
              <h3 className="text-sm font-semibold text-text">{t('video.chapters')}</h3>
              <ul className="space-y-0.5">
                {chapters.map((c, i) => (
                  <li key={`${c.seconds}-${i}`}>
                    <button
                      type="button"
                      onClick={() => handleSeek(c.seconds)}
                      className="group flex w-full items-baseline gap-3 rounded-md px-2 py-1.5 text-left text-sm transition-colors hover:bg-surface-2"
                    >
                      <span className="shrink-0 tabular-nums font-semibold text-brand-700 group-hover:underline">
                        {formatSeconds(c.seconds)}
                      </span>
                      <span className="text-text">{c.label}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {bullets.length > 0 && (
            <div className="space-y-1.5">
              {chapters.length > 0 && (
                <h3 className="text-sm font-semibold text-text">{t('video.resources')}</h3>
              )}
              <ul className="list-disc space-y-1.5 pl-5 text-sm text-text">
                {bullets.map((b, i) => (
                  <li key={i}>
                    {b.segments.map((seg, j) =>
                      seg.type === 'link' ? (
                        <a
                          key={j}
                          href={seg.href}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-brand-700 underline underline-offset-2 hover:text-brand-800 break-all"
                        >
                          {seg.label}
                        </a>
                      ) : (
                        <span key={j}>{seg.value}</span>
                      ),
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
