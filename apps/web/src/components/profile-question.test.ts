/**
 * Copyright (c) VA360 LABS S.L.
 * SPDX-License-Identifier: LicenseRef-Didacta-Sustainable-Use
 */

import { describe, it, expect } from 'vitest';
import { parseProfileQuestion } from './profile-question';

describe('parseProfileQuestion', () => {
  it('parsea prompt + opciones y deriva la clave del prompt (slug)', () => {
    const spec = parseProfileQuestion({
      profileQuestion: { prompt: '¿Cuál es tu situación actual?', options: ['A', 'B', 'C'] },
    });
    expect(spec).toEqual({
      key: 'cual-es-tu-situacion-actual',
      prompt: '¿Cuál es tu situación actual?',
      options: ['A', 'B', 'C'],
    });
  });

  it('respeta una clave explícita y limpia opciones vacías', () => {
    const spec = parseProfileQuestion({
      profileQuestion: { key: 'situacion-actual', prompt: 'P', options: ['A', '  ', 'B'] },
    });
    expect(spec?.key).toBe('situacion-actual');
    expect(spec?.options).toEqual(['A', 'B']);
  });

  // Controles: nada de esto debe producir pregunta.
  it('devuelve null sin prompt, con menos de 2 opciones, o sin profileQuestion', () => {
    expect(parseProfileQuestion({ profileQuestion: { options: ['A', 'B'] } })).toBeNull();
    expect(parseProfileQuestion({ profileQuestion: { prompt: 'P', options: ['A'] } })).toBeNull();
    expect(parseProfileQuestion({ profileQuestion: { prompt: 'P', options: [] } })).toBeNull();
    expect(parseProfileQuestion({ videoUrl: 'x' })).toBeNull();
    expect(parseProfileQuestion({})).toBeNull();
  });
});
