/**
 * Copyright (c) VA360 LABS S.L.
 * SPDX-License-Identifier: LicenseRef-Didacta-Sustainable-Use
 */

import { describe, it, expect } from 'vitest';
import { parseAiAction } from './reto-ai-action';

describe('parseAiAction', () => {
  it('parsea el prompt y usa la clave por defecto `ai`', () => {
    expect(parseAiAction({ aiAction: { prompt: 'Consultá con Danna tu producto' } })).toEqual({
      key: 'ai',
      prompt: 'Consultá con Danna tu producto',
    });
  });

  it('respeta una clave explícita (slug)', () => {
    expect(parseAiAction({ aiAction: { key: 'Analisis Producto', prompt: 'X' } })).toEqual({
      key: 'analisis-producto',
      prompt: 'X',
    });
  });

  // Controles: nada de esto debe producir acción.
  it('devuelve null sin prompt o sin aiAction', () => {
    expect(parseAiAction({ aiAction: { key: 'ai' } })).toBeNull();
    expect(parseAiAction({ aiAction: { prompt: '  ' } })).toBeNull();
    expect(parseAiAction({ aiAction: 'x' })).toBeNull();
    expect(parseAiAction({ videoUrl: 'x' })).toBeNull();
    expect(parseAiAction({})).toBeNull();
  });
});
