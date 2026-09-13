/**
 * Copyright (c) VA360 LABS S.L.
 * SPDX-License-Identifier: LicenseRef-Didacta-Sustainable-Use
 */

export interface AiActionSpec {
  /** Clave estable de la acción dentro de la lección (para trazar el "hecho"). */
  key: string;
  /** Guía para el alumno: qué consultarle a Danna en este reto. */
  prompt: string;
}

/**
 * Parsea `content.aiAction` = `{ prompt, key? }` a un spec válido, o null. La
 * acción con IA (Retos 2 y 3) se completa con ≥1 consulta a Danna; requiere un
 * `prompt` (la guía). `key` cae a `ai` si no se define.
 */
export function parseAiAction(content: Record<string, unknown>): AiActionSpec | null {
  const raw = content['aiAction'];
  if (!raw || typeof raw !== 'object') return null;
  const a = raw as Record<string, unknown>;
  const prompt = typeof a['prompt'] === 'string' ? a['prompt'].trim() : '';
  if (!prompt) return null;
  const keyRaw = typeof a['key'] === 'string' && a['key'].trim() ? a['key'].trim() : 'ai';
  const key = keyRaw
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64);
  return { key: key || 'ai', prompt };
}
