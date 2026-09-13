/**
 * Copyright (c) VA360 LABS S.L.
 * SPDX-License-Identifier: LicenseRef-Didacta-Sustainable-Use
 */

import { describe, it, expect } from 'vitest';
import { retoPointsFromContent, retoBadgeFromContent } from './gamification-events.bridge';

describe('retoPointsFromContent (puntos por reto)', () => {
  it('devuelve los puntos cuando content.retoPoints es un número > 0', () => {
    expect(retoPointsFromContent({ retoPoints: 50 })).toBe(50);
    expect(retoPointsFromContent({ retoPoints: 150 })).toBe(150);
  });

  it('acepta el número en string (viene del <input type=number>)', () => {
    expect(retoPointsFromContent({ retoPoints: '80' })).toBe(80);
  });

  it('trunca decimales a entero', () => {
    expect(retoPointsFromContent({ retoPoints: 12.9 })).toBe(12);
  });

  // Controles: nada de esto debe otorgar puntos (0 = lección normal).
  it('devuelve 0 para lección normal (sin retoPoints)', () => {
    expect(retoPointsFromContent({ videoUrl: 'https://x/y.mp4' })).toBe(0);
    expect(retoPointsFromContent({})).toBe(0);
    expect(retoPointsFromContent(null)).toBe(0);
    expect(retoPointsFromContent(undefined)).toBe(0);
  });

  it('devuelve 0 para 0, negativos o basura', () => {
    expect(retoPointsFromContent({ retoPoints: 0 })).toBe(0);
    expect(retoPointsFromContent({ retoPoints: -50 })).toBe(0);
    expect(retoPointsFromContent({ retoPoints: 'abc' })).toBe(0);
    expect(retoPointsFromContent({ retoPoints: NaN })).toBe(0);
  });
});

describe('retoBadgeFromContent (insignia por reto)', () => {
  it('devuelve la insignia con emoji y label', () => {
    expect(
      retoBadgeFromContent({ retoBadge: { label: 'Mente Dropshipper', emoji: '🧠' } }),
    ).toEqual({
      key: 'Mente Dropshipper',
      label: 'Mente Dropshipper',
      emoji: '🧠',
    });
  });

  it('usa `key` cuando se define; emoji opcional', () => {
    expect(
      retoBadgeFromContent({ retoBadge: { key: 'reto-1', label: 'Mente Dropshipper' } }),
    ).toEqual({ key: 'reto-1', label: 'Mente Dropshipper', emoji: null });
  });

  // Controles: nada de esto debe otorgar insignia.
  it('devuelve null sin label o sin retoBadge', () => {
    expect(retoBadgeFromContent({ retoBadge: { emoji: '🧠' } })).toBeNull();
    expect(retoBadgeFromContent({ retoBadge: {} })).toBeNull();
    expect(retoBadgeFromContent({ retoBadge: 'x' })).toBeNull();
    expect(retoBadgeFromContent({ videoUrl: 'x' })).toBeNull();
    expect(retoBadgeFromContent(null)).toBeNull();
  });

  it('recorta label/key/emoji a los límites de columna', () => {
    const long = 'x'.repeat(200);
    const b = retoBadgeFromContent({ retoBadge: { label: long, emoji: long } })!;
    expect(b.label.length).toBe(120);
    expect(b.key.length).toBe(64);
    expect(b.emoji!.length).toBe(16);
  });
});
