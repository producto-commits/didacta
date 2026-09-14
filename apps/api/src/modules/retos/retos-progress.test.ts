/**
 * Copyright (c) VA360 LABS S.L.
 * SPDX-License-Identifier: LicenseRef-Didacta-Sustainable-Use
 */

import { describe, it, expect } from 'vitest';
import { computeModulePercent, computeRetoProgress } from './retos-progress';

const reto1 = {
  lessonId: 'l1',
  quizId: 'q1',
  actions: [
    {
      key: 'perfil',
      type: 'PROFILE_QUESTION',
      title: 'Pregunta de perfil',
      required: true,
      config: {},
    },
  ],
};

describe('computeRetoProgress', () => {
  it('Reto 1: video + quiz + perfil = 3 pasos; con 2 hechos da 67 % y no completo (como el spec)', () => {
    const p = computeRetoProgress(reto1, [
      { actionKey: 'video', count: 1 },
      { actionKey: 'quiz', count: 1 },
    ]);
    expect(p.steps.map((s) => s.key)).toEqual(['video', 'quiz', 'perfil']);
    expect(p.requiredTotal).toBe(3);
    expect(p.requiredDone).toBe(2);
    expect(p.percent).toBe(67);
    expect(p.complete).toBe(false);
  });

  it('se completa solo con TODOS los pasos requeridos hechos', () => {
    const p = computeRetoProgress(reto1, [
      { actionKey: 'video', count: 1 },
      { actionKey: 'quiz', count: 1 },
      { actionKey: 'perfil', count: 1 },
    ]);
    expect(p.percent).toBe(100);
    expect(p.complete).toBe(true);
  });

  it('Reto 2: la acción opcional (primer pedido) no entra en el % ni bloquea', () => {
    const reto2 = {
      lessonId: 'l2',
      quizId: 'q2',
      actions: [
        {
          key: 'producto',
          type: 'AI_ANALYZE_IMAGE',
          title: 'Producto',
          required: true,
          config: { submissions: 1 },
        },
        {
          key: 'pedido',
          type: 'AI_ANALYZE_IMAGE',
          title: 'Mi primer pedido',
          required: false,
          config: {},
        },
      ],
    };
    const p = computeRetoProgress(reto2, [
      { actionKey: 'video', count: 1 },
      { actionKey: 'quiz', count: 1 },
      { actionKey: 'producto', count: 1 },
    ]);
    expect(p.requiredTotal).toBe(3);
    expect(p.complete).toBe(true);
    expect(p.steps.find((s) => s.key === 'pedido')?.done).toBe(false);
  });

  it('Reto 3: dos capturas — con una aprobada queda "1 de 2" y no completa', () => {
    const reto3 = {
      lessonId: 'l3',
      quizId: 'q3',
      actions: [
        {
          key: 'publicacion',
          type: 'AI_ANALYZE_IMAGE',
          title: 'Publicación',
          required: true,
          config: { submissions: 2 },
        },
      ],
    };
    const p = computeRetoProgress(reto3, [
      { actionKey: 'video', count: 1 },
      { actionKey: 'quiz', count: 1 },
      { actionKey: 'publicacion', count: 1 },
    ]);
    const pub = p.steps.find((s) => s.key === 'publicacion')!;
    expect(pub.count).toBe(1);
    expect(pub.needed).toBe(2);
    expect(pub.done).toBe(false);
    expect(p.percent).toBe(67);
    const p2 = computeRetoProgress(reto3, [
      { actionKey: 'video', count: 1 },
      { actionKey: 'quiz', count: 1 },
      { actionKey: 'publicacion', count: 2 },
    ]);
    expect(p2.complete).toBe(true);
  });

  it('Retos 4 y 5: solo video + quiz → 50 % cada paso', () => {
    const reto4 = { lessonId: 'l4', quizId: 'q4', actions: [] };
    expect(computeRetoProgress(reto4, [{ actionKey: 'video', count: 1 }]).percent).toBe(50);
    expect(computeRetoProgress(reto4, []).complete).toBe(false);
  });

  it('un reto sin lección ni quiz ni acciones nunca está completo', () => {
    expect(computeRetoProgress({ lessonId: null, quizId: null, actions: [] }, []).complete).toBe(
      false,
    );
  });
});

describe('computeModulePercent', () => {
  it('media de los retos (spec: 67/0/0/0/0 → 13 %)', () => {
    expect(computeModulePercent([67, 0, 0, 0, 0])).toBe(13);
    expect(computeModulePercent([100, 100, 100, 50, 0])).toBe(70);
    expect(computeModulePercent([])).toBe(0);
  });
});
