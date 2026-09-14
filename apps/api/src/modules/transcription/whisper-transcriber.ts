/**
 * Copyright (c) VA360 LABS S.L.
 * SPDX-License-Identifier: LicenseRef-Didacta-Sustainable-Use
 */

/**
 * Transcripción de un vídeo SUBIDO (mp4/webm en S3/MinIO) con Whisper
 * (auto-transcripción, LMS-90.D). A diferencia de YouTube, aquí no hay
 * subtítulos que bajar: hay que pasar el audio por un modelo de voz→texto.
 *
 * Decisión de arquitectura (registrada en commit):
 *   - Se llama a un servicio Whisper EXTERNO por HTTP, configurable por env, en
 *     vez de meter el modelo en el proceso Node. Así el camino por defecto es
 *     GRATIS: un contenedor `faster-whisper` autoalojado en la misma VPS (sin
 *     coste por minuto). El mismo contrato sirve para apuntar a Groq/OpenAI si
 *     algún día se quiere pagar por velocidad.
 *   - Se le manda la URL FIRMADA del objeto (no los bytes): el servicio Whisper
 *     baja el vídeo, extrae el audio con ffmpeg y transcribe. Evita cargar
 *     vídeos de varios GB en la RAM de la API.
 *
 * Contrato del servicio (mínimo, cualquier wrapper de faster-whisper lo cumple
 * en ~20 líneas):
 *   POST {WHISPER_URL}  body: { "url": "<signed>", "language": "es" }
 *   200  → { "text": "transcripción..." }
 *
 * La construcción del request es PURA y testeable; la parte de red recibe el
 * `fetch` inyectable.
 */

export interface WhisperConfig {
  /** Endpoint del servicio Whisper (env TRANSCRIPTION_WHISPER_URL). */
  endpoint: string;
  /** Bearer opcional (env TRANSCRIPTION_WHISPER_KEY) para proteger el servicio. */
  apiKey?: string;
  /** Idioma que se le sugiere al modelo (env TRANSCRIPTION_WHISPER_LANG, def 'es'). */
  language?: string;
  /** Timeout en ms para la transcripción (vídeos largos tardan). Def 10 min. */
  timeoutMs?: number;
}

export interface WhisperRequest {
  url: string;
  headers: Record<string, string>;
  body: string;
}

/** Construye el request HTTP al servicio Whisper. PURA. */
export function buildTranscriptionRequest(
  signedAudioUrl: string,
  config: WhisperConfig,
): WhisperRequest {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (config.apiKey) headers['Authorization'] = `Bearer ${config.apiKey}`;
  return {
    url: config.endpoint,
    headers,
    body: JSON.stringify({ url: signedAudioUrl, language: config.language ?? 'es' }),
  };
}

/** Lee `config` desde el entorno. Devuelve null si no hay endpoint configurado. */
export function whisperConfigFromEnv(env: NodeJS.ProcessEnv = process.env): WhisperConfig | null {
  const endpoint = env['TRANSCRIPTION_WHISPER_URL']?.trim();
  if (!endpoint) return null;
  const apiKey = env['TRANSCRIPTION_WHISPER_KEY']?.trim();
  const language = env['TRANSCRIPTION_WHISPER_LANG']?.trim() || 'es';
  const timeoutRaw = Number(env['TRANSCRIPTION_WHISPER_TIMEOUT_MS']);
  return {
    endpoint,
    apiKey: apiKey || undefined,
    language,
    timeoutMs: Number.isFinite(timeoutRaw) && timeoutRaw > 0 ? timeoutRaw : 10 * 60 * 1000,
  };
}

export interface TranscribeOptions {
  fetchImpl?: typeof fetch;
}

/**
 * Manda la URL firmada al servicio Whisper y devuelve el texto. Devuelve null si
 * el servicio no responde texto (para que el bridge lo trate como "sin
 * transcripción", no como error fatal).
 */
export async function transcribeStorageVideo(
  signedAudioUrl: string,
  config: WhisperConfig,
  opts: TranscribeOptions = {},
): Promise<string | null> {
  const doFetch = opts.fetchImpl ?? fetch;
  const req = buildTranscriptionRequest(signedAudioUrl, config);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), config.timeoutMs ?? 10 * 60 * 1000);
  try {
    const res = await doFetch(req.url, {
      method: 'POST',
      headers: req.headers,
      body: req.body,
      signal: controller.signal,
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { text?: unknown };
    const text = typeof data.text === 'string' ? data.text.trim() : '';
    return text || null;
  } finally {
    clearTimeout(timer);
  }
}
