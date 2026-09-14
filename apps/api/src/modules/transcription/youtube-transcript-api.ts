/**
 * Copyright (c) VA360 LABS S.L.
 * SPDX-License-Identifier: LicenseRef-Didacta-Sustainable-Use
 */

/**
 * Transcripción de vídeos de YouTube vía transcriptapi.com (auto-transcripción,
 * LMS-90.D).
 *
 * Por qué un servicio externo y no un scrape propio: YouTube bloquea las IPs de
 * datacenter ("Sign in to confirm you're not a bot") y el endpoint `timedtext`
 * exige un POT token. Bajar los subtítulos DESDE la VPS es inviable sin cookies
 * o proxy residencial. transcriptapi.com resuelve eso por su lado (proxies,
 * tokens) y nos devuelve el texto ya listo — es la vía automática y estable.
 *
 * Contrato (https://transcriptapi.com):
 *   GET /api/v2/youtube/transcript?video_url=<id|url>&format=json&language=es
 *   Authorization: Bearer <API_KEY>
 *   200 -> { language, length_seconds, metadata, transcript: [{text, start, duration}] }
 *
 * La construcción del request y el parseo de la respuesta son PUROS y testeables;
 * la parte de red recibe el `fetch` inyectable.
 */

const DEFAULT_ENDPOINT = 'https://transcriptapi.com/api/v2/youtube/transcript';

export interface TranscriptApiConfig {
  apiKey: string;
  endpoint: string;
  /** Idioma(s) preferido(s). Acepta lista y `asr` para autogenerados (p.ej. "es,asr"). */
  language: string;
}

/** Lee la config del entorno. Null si no hay API key configurada. */
export function transcriptApiConfigFromEnv(
  env: NodeJS.ProcessEnv = process.env,
): TranscriptApiConfig | null {
  const apiKey = env['TRANSCRIPTAPI_KEY']?.trim();
  if (!apiKey) return null;
  return {
    apiKey,
    endpoint: env['TRANSCRIPTAPI_URL']?.trim() || DEFAULT_ENDPOINT,
    language: env['TRANSCRIPTAPI_LANG']?.trim() || 'es',
  };
}

/** Construye la URL del request. PURA. */
export function buildTranscriptApiUrl(videoIdOrUrl: string, config: TranscriptApiConfig): string {
  const url = new URL(config.endpoint);
  url.searchParams.set('video_url', videoIdOrUrl);
  url.searchParams.set('format', 'json');
  if (config.language) url.searchParams.set('language', config.language);
  return url.toString();
}

/** Aplana el array `transcript` de la respuesta a texto plano. PURA. */
export function parseTranscriptApiResponse(data: unknown): string {
  const arr = (data as { transcript?: unknown } | null | undefined)?.transcript;
  if (!Array.isArray(arr)) return '';
  return arr
    .map((seg) => {
      const t = (seg as { text?: unknown } | null)?.text;
      return typeof t === 'string' ? t : '';
    })
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export interface FetchTranscriptApiOptions {
  fetchImpl?: typeof fetch;
}

/**
 * Pide el transcript a transcriptapi.com. Devuelve null si no hay transcripción
 * (o el servicio falla) para que el bridge lo trate como "sin transcripción", no
 * como error fatal.
 */
export async function fetchYoutubeTranscriptViaApi(
  videoIdOrUrl: string,
  config: TranscriptApiConfig,
  opts: FetchTranscriptApiOptions = {},
): Promise<string | null> {
  const doFetch = opts.fetchImpl ?? fetch;
  const res = await doFetch(buildTranscriptApiUrl(videoIdOrUrl, config), {
    headers: { Authorization: `Bearer ${config.apiKey}` },
  });
  if (!res.ok) return null;
  const data = (await res.json()) as unknown;
  const text = parseTranscriptApiResponse(data);
  return text || null;
}
