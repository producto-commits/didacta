/**
 * Copyright (c) VA360 LABS S.L.
 * SPDX-License-Identifier: LicenseRef-Didacta-Sustainable-Use
 */

import { describe, expect, it } from 'vitest';
import { computarPerfil, perfilRespuestasSchema, type PerfilRespuestas } from './perfilamiento';

/** Base "listo para arrancar, nunca vendió" — cada test cambia lo que importa. */
const base: PerfilRespuestas = {
  experiencia: 'nunca',
  modelo: 'no_se',
  ordenes: 'ninguna_reciente',
  obstaculo: 'ninguno_listo',
  objetivo: 'entender',
};

describe('computarPerfil', () => {
  it('nunca vendió + no entiende el modelo → cero_experiencia', () => {
    expect(computarPerfil(base).segmento).toBe('cero_experiencia');
  });

  it('CONTROL: entiende el modelo pero nunca ejecutó → conoce_concepto (discrimina de cero)', () => {
    expect(computarPerfil({ ...base, modelo: 'entiendo_no_practique' }).segmento).toBe(
      'conoce_concepto',
    );
  });

  it('vendió en redes → vendio_fuera (aunque no entienda Dropi)', () => {
    expect(computarPerfil({ ...base, experiencia: 'vendi_redes', modelo: 'no_se' }).segmento).toBe(
      'vendio_fuera',
    );
  });

  it('0 órdenes con registro antiguo → registrado_inactivo (Flujo 1)', () => {
    expect(computarPerfil({ ...base, ordenes: 'ninguna_antiguo' }).segmento).toBe(
      'registrado_inactivo',
    );
  });

  it('tiene órdenes y quiere volver a vender → activado_inactivo (Flujo 2)', () => {
    expect(computarPerfil({ ...base, ordenes: '1_9', objetivo: 'volver_vender' }).segmento).toBe(
      'activado_inactivo',
    );
  });

  it('CONTROL: tiene órdenes y quiere aumentar ventas → activo (discrimina de activado_inactivo)', () => {
    expect(
      computarPerfil({ ...base, ordenes: '10_100', objetivo: 'aumentar_ventas' }).segmento,
    ).toBe('activo');
  });

  it('propaga objetivo (Q5) y obstaculo (Q4) tal cual', () => {
    const p = computarPerfil({ ...base, objetivo: 'primera_venta', obstaculo: 'producto' });
    expect(p.objetivo).toBe('primera_venta');
    expect(p.obstaculo).toBe('producto');
  });

  it('el schema rechaza códigos desconocidos', () => {
    expect(perfilRespuestasSchema.safeParse({ ...base, ordenes: 'muchas' }).success).toBe(false);
  });
});
