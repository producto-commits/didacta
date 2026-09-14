/**
 * Copyright (c) VA360 LABS S.L.
 * SPDX-License-Identifier: LicenseRef-Didacta-Sustainable-Use
 */

import type { AiAnalyzeImageConfig } from './action-catalog';

/**
 * Validación de una captura con IA de visión para las acciones
 * `AI_ANALYZE_IMAGE` (docs/retos/plan-retos.md §3.2 y §3.5).
 *
 * La IA recibe el prompt configurado por el admin + la imagen y responde un
 * veredicto en JSON estricto:
 *   { "valido": boolean, "canal": string|null, "feedback": string }
 *
 * - `valido`: si la captura cumple lo que pide la acción (es un producto de
 *   Dropi, es un pedido cargado, es una publicación real…). Solo entonces la
 *   acción cuenta.
 * - `canal`: para publicaciones (Reto 3), el canal detectado.
 * - `feedback`: en modo `analysis` (Reto 2, producto) son las recomendaciones
 *   de venta; en modo `fixed` la plataforma muestra el mensaje fijo del admin
 *   y este texto solo se guarda como evidencia.
 *
 * Este módulo es PURO (prompt y parseo) para poder testearlo; la llamada al
 * AI Gateway vive en RetosSubmissionsService.
 */

export interface ImageVerdict {
  valido: boolean;
  canal: string | null;
  feedback: string;
}

export const VERDICT_SYSTEM_PROMPT = `Eres el validador de retos de Dropi Academy. Recibes UNA imagen enviada por un alumno y una consigna que dice qué debe mostrar. Analiza la imagen con rigor: si no cumple la consigna, no la des por válida.
Responde ÚNICAMENTE con un objeto JSON válido, sin texto antes ni después, con esta forma exacta:
{"valido": true|false, "canal": "<canal detectado o null>", "feedback": "<texto para el alumno>"}
Reglas del feedback: español neutro, trato de "tú", claro y motivador, sin inventar datos que no estén en la imagen. Si la imagen NO es válida, explica en una o dos frases qué falta y qué debe enviar.`;

/** Instrucciones del turno de usuario según el modo de feedback de la acción. */
export function buildUserInstruction(
  cfg: Pick<AiAnalyzeImageConfig, 'prompt' | 'feedbackMode'>,
): string {
  const base = `Consigna de la acción: ${cfg.prompt.trim()}`;
  if (cfg.feedbackMode === 'analysis') {
    return (
      base +
      `\n\nSi la imagen es válida, escribe en "feedback" recomendaciones personalizadas de venta para ESTE producto (máximo 120 palabras) con tres partes: 1) ángulo de venta sugerido, 2) a quién le puedes vender este producto, 3) cómo comunicar su valor.`
    );
  }
  return (
    base +
    `\n\nSi la imagen es válida, escribe en "feedback" una sola frase de confirmación (máximo 25 palabras). Indica en "canal" dónde está publicado si se distingue (WhatsApp, Facebook Marketplace, Instagram, TikTok, Meta Ads…).`
  );
}

/**
 * Extrae y valida el veredicto JSON de la respuesta del modelo. Tolera texto
 * alrededor (busca el primer objeto `{…}`) y fences de markdown. Devuelve null
 * si no hay un JSON usable: el caller lo trata como "no válido" y pide otra
 * captura, nunca como acierto.
 */
export function parseVerdict(text: string): ImageVerdict | null {
  if (!text) return null;
  const cleaned = text.replace(/```(?:json)?/gi, '').trim();
  const start = cleaned.indexOf('{');
  const end = cleaned.lastIndexOf('}');
  if (start === -1 || end <= start) return null;
  let obj: unknown;
  try {
    obj = JSON.parse(cleaned.slice(start, end + 1));
  } catch {
    return null;
  }
  if (!obj || typeof obj !== 'object') return null;
  const o = obj as Record<string, unknown>;
  const valido = typeof o['valido'] === 'boolean' ? o['valido'] : parseBoolish(o['valido']);
  if (valido === null) return null;
  const canal =
    typeof o['canal'] === 'string' && o['canal'].trim() ? o['canal'].trim().slice(0, 60) : null;
  const feedback = typeof o['feedback'] === 'string' ? o['feedback'].trim().slice(0, 2000) : '';
  return { valido, canal, feedback };
}

function parseBoolish(v: unknown): boolean | null {
  if (typeof v === 'string') {
    const s = v.trim().toLowerCase();
    if (s === 'true' || s === 'sí' || s === 'si') return true;
    if (s === 'false' || s === 'no') return false;
  }
  return null;
}

/** Tipos MIME de imagen aceptados para una entrega y su extensión de archivo. */
export const IMAGE_MIME_EXT: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};

/** Tope de tamaño de una captura (bytes decodificados). */
export const MAX_IMAGE_BYTES = 6 * 1024 * 1024;

/** Construye la data URL que viaja al modelo. */
export function toDataUrl(mimeType: string, bytes: Buffer): string {
  return `data:${mimeType};base64,${bytes.toString('base64')}`;
}
