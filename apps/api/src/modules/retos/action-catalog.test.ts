/**
 * Copyright (c) VA360 LABS S.L.
 * SPDX-License-Identifier: LicenseRef-Didacta-Sustainable-Use
 */

import { describe, it, expect } from 'vitest';
import {
  RETO_ACTION_TYPES,
  parseActionConfig,
  requiredSubmissions,
  actionNeedsUpload,
  listActionTypes,
} from './action-catalog';

describe('parseActionConfig', () => {
  it('PROFILE_QUESTION exige questionKey, prompt y 2..8 opciones', () => {
    const ok = parseActionConfig('PROFILE_QUESTION', {
      questionKey: 'situacion-actual',
      prompt: '¿Cuál es tu situación actual?',
      options: ['Soy nuevo', 'Ya vendí'],
    });
    expect(ok['questionKey']).toBe('situacion-actual');
    expect(() =>
      parseActionConfig('PROFILE_QUESTION', { questionKey: 'x', prompt: 'p?', options: ['una'] }),
    ).toThrow();
  });

  it('AI_ANALYZE_IMAGE aplica defaults (1 captura, modo analysis)', () => {
    const c = parseActionConfig('AI_ANALYZE_IMAGE', {
      steps: ['Elige un producto'],
      prompt: 'Verifica que sea un producto de Dropi',
    });
    expect(c['submissions']).toBe(1);
    expect(c['feedbackMode']).toBe('analysis');
  });

  it('AI_ANALYZE_IMAGE en modo fixed exige fixedMessage (Reto 3)', () => {
    expect(() =>
      parseActionConfig('AI_ANALYZE_IMAGE', {
        steps: ['Publica'],
        prompt: 'Verifica publicación',
        feedbackMode: 'fixed',
      }),
    ).toThrow(/fixedMessage/);
    const ok = parseActionConfig('AI_ANALYZE_IMAGE', {
      steps: ['Publica'],
      prompt: 'Verifica publicación',
      submissions: 2,
      feedbackMode: 'fixed',
      fixedMessage: '¡Excelente, ya estás en el juego!',
    });
    expect(ok['submissions']).toBe(2);
  });

  it('AI_ANALYZE_IMAGE acepta la insignia de perfil que otorga (acción 4 del Reto 2)', () => {
    const c = parseActionConfig('AI_ANALYZE_IMAGE', {
      steps: ['Carga tu pedido'],
      prompt: 'Verifica pedido en Dropi',
      feedbackMode: 'fixed',
      fixedMessage: 'Pasaste a Activado',
      grantsProfileBadge: { key: 'activado', label: 'Activado', emoji: '⚡' },
    });
    expect((c['grantsProfileBadge'] as { key: string }).key).toBe('activado');
  });

  it('SELF_CONFIRM exige instrucciones; DB_* acepta config vacía', () => {
    expect(() => parseActionConfig('SELF_CONFIRM', {})).toThrow();
    expect(parseActionConfig('DB_ORDER_CREATED', undefined)).toEqual({});
  });
});

describe('requiredSubmissions / actionNeedsUpload', () => {
  it('2 capturas para el Reto 3, 1 por defecto, 1 para tipos sin entregas', () => {
    expect(requiredSubmissions('AI_ANALYZE_IMAGE', { submissions: 2 })).toBe(2);
    expect(requiredSubmissions('AI_ANALYZE_IMAGE', {})).toBe(1);
    expect(requiredSubmissions('PROFILE_QUESTION', { submissions: 5 })).toBe(1);
  });

  it('solo AI_ANALYZE_IMAGE sube archivos', () => {
    expect(actionNeedsUpload('AI_ANALYZE_IMAGE')).toBe(true);
    expect(actionNeedsUpload('SELF_CONFIRM')).toBe(false);
  });

  it('listActionTypes cubre todo el catálogo', () => {
    expect(listActionTypes().map((t) => t.type)).toEqual([...RETO_ACTION_TYPES]);
  });
});
