/**
 * Copyright (c) VA360 LABS S.L.
 * SPDX-License-Identifier: LicenseRef-Didacta-Sustainable-Use
 */

import { describe, it, expect } from 'vitest';
import { buildUserInstruction, parseVerdict, toDataUrl } from './reto-ai-validator';

describe('parseVerdict', () => {
  it('lee un JSON limpio', () => {
    expect(parseVerdict('{"valido": true, "canal": "WhatsApp", "feedback": "Bien"}')).toEqual({
      valido: true,
      canal: 'WhatsApp',
      feedback: 'Bien',
    });
  });

  it('tolera fences de markdown y texto alrededor', () => {
    const txt =
      'Claro:\n```json\n{"valido": false, "canal": null, "feedback": "No es un producto."}\n```\nListo.';
    expect(parseVerdict(txt)).toEqual({
      valido: false,
      canal: null,
      feedback: 'No es un producto.',
    });
  });

  it('acepta "valido" como string sí/no', () => {
    expect(parseVerdict('{"valido":"sí","feedback":"ok"}')?.valido).toBe(true);
    expect(parseVerdict('{"valido":"no","feedback":"x"}')?.valido).toBe(false);
  });

  it('null si no hay JSON o falta valido — nunca cuenta como acierto', () => {
    expect(parseVerdict('la imagen parece un producto')).toBeNull();
    expect(parseVerdict('{"feedback":"sin veredicto"}')).toBeNull();
    expect(parseVerdict('')).toBeNull();
  });

  it('recorta canal y feedback a sus topes', () => {
    const v = parseVerdict(
      JSON.stringify({ valido: true, canal: 'x'.repeat(100), feedback: 'y'.repeat(3000) }),
    )!;
    expect(v.canal!.length).toBe(60);
    expect(v.feedback.length).toBe(2000);
  });
});

describe('buildUserInstruction', () => {
  it('modo analysis pide las 3 partes de recomendaciones (Reto 2)', () => {
    const s = buildUserInstruction({
      prompt: 'Debe ser un producto de Dropi',
      feedbackMode: 'analysis',
    });
    expect(s).toContain('Consigna de la acción: Debe ser un producto de Dropi');
    expect(s).toMatch(/ángulo de venta/);
    expect(s).toMatch(/a quién/);
    expect(s).toMatch(/comunicar su valor/);
  });

  it('modo fixed pide confirmación breve y el canal (Reto 3)', () => {
    const s = buildUserInstruction({ prompt: 'Publicación real', feedbackMode: 'fixed' });
    expect(s).toMatch(/una sola frase/);
    expect(s).toMatch(/canal/);
  });
});

describe('toDataUrl', () => {
  it('arma la data URL con el MIME y base64', () => {
    expect(toDataUrl('image/png', Buffer.from('abc'))).toBe('data:image/png;base64,YWJj');
  });
});
