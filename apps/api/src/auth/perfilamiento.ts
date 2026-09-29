/**
 * Copyright (c) VA360 LABS S.L.
 * SPDX-License-Identifier: LicenseRef-Didacta-Sustainable-Use
 *
 * Perfilamiento de usuario (diagnóstico inicial). 5 preguntas de selección
 * múltiple → un segmento + objetivo + obstáculo, que guían el onboarding, los
 * retos y el flujo de WhatsApp (vía webhook a GHL). Ver
 * docs/perfilamiento-usuario-plan.md.
 *
 * Los valores son códigos `snake_case` ESTABLES (no el texto visible, que vive
 * en el i18n del frontend). El backend valida contra estos códigos y `computarPerfil`
 * los mapea al segmento — determinista y testeable (perfilamiento.test.ts).
 */

import { z } from 'zod';

// --- Opciones por pregunta (deben coincidir con el frontend) -----------------

export const Q1_EXPERIENCIA = [
  'nunca',
  'intente_sin_resultado',
  'vendi_redes',
  'vendi_dropi',
] as const;
export const Q2_MODELO = [
  'no_se',
  'escuche_algo',
  'entiendo_no_practique',
  'entiendo_practique',
] as const;
export const Q3_ORDENES = [
  'ninguna_reciente',
  'ninguna_antiguo',
  '1_9',
  '10_100',
  'mas_100',
] as const;
export const Q4_OBSTACULO = [
  'producto',
  'publicar_clientes',
  'no_entiendo_dropi',
  'tiempo',
  'malas_experiencias',
  'ninguno_listo',
] as const;
export const Q5_OBJETIVO = [
  'entender',
  'primera_venta',
  'volver_vender',
  'aumentar_ventas',
] as const;

export const perfilRespuestasSchema = z.object({
  experiencia: z.enum(Q1_EXPERIENCIA),
  modelo: z.enum(Q2_MODELO),
  ordenes: z.enum(Q3_ORDENES),
  obstaculo: z.enum(Q4_OBSTACULO),
  objetivo: z.enum(Q5_OBJETIVO),
});
export type PerfilRespuestas = z.infer<typeof perfilRespuestasSchema>;

// --- Segmento resultante -----------------------------------------------------

export const SEGMENTOS = [
  'cero_experiencia',
  'conoce_concepto',
  'vendio_fuera',
  'registrado_inactivo',
  'activado_inactivo',
  'activo',
] as const;
export type Segmento = (typeof SEGMENTOS)[number];

export interface Perfil {
  segmento: Segmento;
  /** Q5 tal cual: objetivo a 30 días (guía CTA / flujo de WhatsApp). */
  objetivo: PerfilRespuestas['objetivo'];
  /** Q4 tal cual: principal freno. */
  obstaculo: PerfilRespuestas['obstaculo'];
}

/**
 * Mapa determinista de las 5 respuestas → segmento. La señal más fuerte es Q3
 * (órdenes en Dropi):
 *  - 0 órdenes y registro ANTIGUO → registrado_inactivo (Flujo 1).
 *  - ≥1 orden → activado_inactivo si el objetivo es "volver a vender" (paró),
 *    si no activo (crecimiento).
 *  - 0 órdenes y registro RECIENTE → nuevo: se sub-segmenta por experiencia/modelo.
 */
export function computarPerfil(r: PerfilRespuestas): Perfil {
  const base = { objetivo: r.objetivo, obstaculo: r.obstaculo };

  if (r.ordenes === 'ninguna_antiguo') {
    return { segmento: 'registrado_inactivo', ...base };
  }
  if (r.ordenes === '1_9' || r.ordenes === '10_100' || r.ordenes === 'mas_100') {
    return { segmento: r.objetivo === 'volver_vender' ? 'activado_inactivo' : 'activo', ...base };
  }

  // r.ordenes === 'ninguna_reciente' → usuario nuevo, 0 órdenes.
  if (r.experiencia === 'vendi_redes' || r.experiencia === 'vendi_dropi') {
    // Vendió fuera de Dropi (o ya tocó Dropi): solo necesita cómo opera Dropi.
    return { segmento: 'vendio_fuera', ...base };
  }
  if (r.modelo === 'entiendo_no_practique' || r.modelo === 'entiendo_practique') {
    // Entiende el modelo pero nunca lo ejecutó: puede saltar la explicación básica.
    return { segmento: 'conoce_concepto', ...base };
  }
  // Nunca vendió y no entiende el modelo: Reto 1 es crítico.
  return { segmento: 'cero_experiencia', ...base };
}
