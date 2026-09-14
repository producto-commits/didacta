/**
 * Copyright (c) VA360 LABS S.L.
 * SPDX-License-Identifier: LicenseRef-Didacta-Sustainable-Use
 */

/**
 * Bajada GRATIS de la transcripción de un vídeo de YouTube (auto-transcripción,
 * LMS-90.D). YouTube ya autogenera subtítulos; aquí los tomamos sin API key ni
 * coste, para rellenar `content.transcript` de una lección VIDEO cuyo `videoUrl`
 * es de YouTube.
 *
 * Estrategia (la única sin key oficial):
 *   1. Se baja la página `watch?v=ID`.
 *   2. Del HTML se extrae `captionTracks` (dentro de ytInitialPlayerResponse):
 *      cada pista trae `baseUrl` (endpoint timedtext) y `languageCode`.
 *   3. Se elige la pista por idioma preferido (es → es-419 → la primera).
 *   4. Se baja el `baseUrl` → XML timedtext → texto plano + segmentos con tiempo.
 *
 * FRÁGIL POR NATURALEZA: depende del HTML de YouTube, que cambia sin aviso. Por
 * eso las tres piezas de parseo son PURAS y testeables con fixtures, y la parte
 * de red recibe el `fetch` inyectable. Si YouTube rompe el scrape, se cambia
 * aquí sin tocar el resto del pipeline.
 */

export interface CaptionTrack {
  baseUrl: string;
  languageCode: string;
  /** 'asr' = autogenerada por reconocimiento de voz; ausente si es manual. */
  kind?: string;
}

export interface TranscriptSegment {
  /** Segundos desde el inicio. */
  start: number;
  /** Duración del segmento en segundos. */
  dur: number;
  text: string;
}

export interface YoutubeTranscript {
  text: string;
  segments: TranscriptSegment[];
  languageCode: string;
}

/** Idiomas preferidos por defecto: español primero (Dropi Academy es ES). */
export const DEFAULT_PREFERRED_LANGS = ['es', 'es-419', 'es-ES'];

/**
 * Extrae las pistas de subtítulos del HTML de la página watch. PURA.
 *
 * `captionTracks` es un array JSON embebido; lo aislamos por su llave y cerramos
 * el corchete equilibrando. No parseamos todo el `ytInitialPlayerResponse`
 * (megabytes) — solo el fragmento que nos interesa.
 */
export function extractCaptionTracks(html: string): CaptionTrack[] {
  const marker = '"captionTracks":';
  const at = html.indexOf(marker);
  if (at === -1) return [];
  const arrStart = html.indexOf('[', at);
  if (arrStart === -1) return [];
  // Cierre del array balanceando corchetes (los baseUrl no llevan '[' ni ']'
  // sin escapar dentro de strings JSON, así que el conteo simple es seguro).
  let depth = 0;
  let end = -1;
  for (let i = arrStart; i < html.length; i++) {
    const c = html[i];
    if (c === '[') depth++;
    else if (c === ']') {
      depth--;
      if (depth === 0) {
        end = i;
        break;
      }
    }
  }
  if (end === -1) return [];
  const json = html.slice(arrStart, end + 1);
  try {
    const parsed = JSON.parse(json) as Array<Record<string, unknown>>;
    return parsed
      .map((t) => ({
        baseUrl: typeof t['baseUrl'] === 'string' ? decodeJsonUnicode(t['baseUrl']) : '',
        languageCode: typeof t['languageCode'] === 'string' ? t['languageCode'] : '',
        kind: typeof t['kind'] === 'string' ? t['kind'] : undefined,
      }))
      .filter((t) => t.baseUrl);
  } catch {
    return [];
  }
}

/**
 * Elige la mejor pista: primer idioma preferido que exista (match por prefijo,
 * así `es` cubre `es-419`); si ninguno, la primera pista disponible. PURA.
 */
export function pickCaptionTrack(
  tracks: CaptionTrack[],
  preferredLangs: string[] = DEFAULT_PREFERRED_LANGS,
): CaptionTrack | null {
  if (tracks.length === 0) return null;
  for (const pref of preferredLangs) {
    const p = pref.toLowerCase();
    const hit = tracks.find((t) => t.languageCode.toLowerCase().startsWith(p));
    if (hit) return hit;
  }
  return tracks[0]!;
}

/**
 * Parsea el XML timedtext de YouTube a segmentos con tiempo + texto plano. PURA.
 *
 * Formato: `<text start="12.34" dur="3.2">línea &amp; con entidades</text>`.
 */
export function parseTimedTextXml(xml: string): { text: string; segments: TranscriptSegment[] } {
  const segments: TranscriptSegment[] = [];
  const re = /<text([^>]*)>([\s\S]*?)<\/text>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml)) !== null) {
    const attrs = m[1] ?? '';
    const rawText = m[2] ?? '';
    const start = Number(/\bstart="([\d.]+)"/.exec(attrs)?.[1] ?? 'NaN');
    const dur = Number(/\bdur="([\d.]+)"/.exec(attrs)?.[1] ?? '0');
    const text = decodeHtmlEntities(rawText).replace(/\s+/g, ' ').trim();
    if (!text) continue;
    segments.push({
      start: Number.isFinite(start) ? start : 0,
      dur: Number.isFinite(dur) ? dur : 0,
      text,
    });
  }
  const text = segments
    .map((s) => s.text)
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();
  return { text, segments };
}

export interface FetchYoutubeOptions {
  preferredLangs?: string[];
  /** Inyectable para test. Por defecto el `fetch` global (Node 18+). */
  fetchImpl?: typeof fetch;
}

/**
 * Orquesta la bajada real: página → pistas → mejor pista → timedtext → texto.
 * Devuelve null si el vídeo no tiene subtítulos (o YouTube cambió el HTML).
 */
export async function fetchYoutubeTranscript(
  videoId: string,
  opts: FetchYoutubeOptions = {},
): Promise<YoutubeTranscript | null> {
  const doFetch = opts.fetchImpl ?? fetch;
  // hl=es sesga la respuesta a español y ayuda a que la pista `es` exista.
  const watchUrl = `https://www.youtube.com/watch?v=${encodeURIComponent(videoId)}&hl=es`;
  const pageRes = await doFetch(watchUrl, {
    headers: {
      // Sin un UA de navegador YouTube sirve una página sin playerResponse.
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36',
      'Accept-Language': 'es-ES,es;q=0.9,en;q=0.6',
    },
  });
  if (!pageRes.ok) return null;
  const html = await pageRes.text();

  const tracks = extractCaptionTracks(html);
  const track = pickCaptionTrack(tracks, opts.preferredLangs);
  if (!track) return null;

  const ttRes = await doFetch(track.baseUrl, {
    headers: { 'Accept-Language': 'es-ES,es;q=0.9' },
  });
  if (!ttRes.ok) return null;
  const xml = await ttRes.text();
  const { text, segments } = parseTimedTextXml(xml);
  if (!text) return null;

  return { text, segments, languageCode: track.languageCode || 'und' };
}

/** Decodifica los `&`-style que YouTube mete en los baseUrl del HTML. */
function decodeJsonUnicode(s: string): string {
  return s.replace(/\\u([0-9a-fA-F]{4})/g, (_, h) => String.fromCharCode(parseInt(h, 16)));
}

/** Entidades HTML básicas + numéricas que aparecen en los captions. */
function decodeHtmlEntities(s: string): string {
  return s
    .replace(/&#(\d+);/g, (_, d) => String.fromCharCode(Number(d)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h) => String.fromCharCode(parseInt(h, 16)))
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&nbsp;/g, ' ');
}
