/**
 * Copyright (c) VA360 LABS S.L.
 * SPDX-License-Identifier: LicenseRef-Didacta-Sustainable-Use
 */

import { describe, it, expect } from 'vitest';
import {
  resolveConversationId,
  buildOutboundPayload,
  danaConfigFromEnv,
  decideInactivityAction,
  parseInbound,
  parseSyncReply,
  secretMatches,
} from './dana-protocol';

const MIN = 60_000;

describe('danaConfigFromEnv', () => {
  it('null sin URL; lee secreto y timeout con default', () => {
    expect(danaConfigFromEnv({})).toBeNull();
    expect(
      danaConfigFromEnv({ DANA_WEBHOOK_URL: 'https://n8n/x', DANA_WEBHOOK_SECRET: 's' }),
    ).toEqual({
      webhookUrl: 'https://n8n/x',
      secret: 's',
      timeoutMs: 20_000,
      conversationTtlMs: 30 * MIN,
    });
  });
  it('lee la inactividad en minutos (preferido) y en horas (legacy)', () => {
    expect(
      danaConfigFromEnv({ DANA_WEBHOOK_URL: 'https://n8n/x', DANA_CONVERSATION_TTL_MINUTES: '45' })!
        .conversationTtlMs,
    ).toBe(45 * MIN);
    expect(
      danaConfigFromEnv({ DANA_WEBHOOK_URL: 'https://n8n/x', DANA_CONVERSATION_TTL_HOURS: '2' })!
        .conversationTtlMs,
    ).toBe(120 * MIN);
  });
});

describe('buildOutboundPayload', () => {
  it('normaliza correo y recorta el mensaje', () => {
    const p = buildOutboundPayload({
      mensaje: '  hola  ',
      correo: ' Diego@Dropi.co ',
      conversacionId: 'c',
      userId: 'u',
      tenantId: 't',
      messageId: 'm',
    });
    expect(p).toEqual({
      mensaje: 'hola',
      correo: 'diego@dropi.co',
      conversacionId: 'c',
      userId: 'u',
      tenantId: 't',
      messageId: 'm',
    });
  });
});

describe('parseSyncReply', () => {
  it('acepta mensaje/respuesta/output/text; null si no hay texto', () => {
    expect(parseSyncReply({ mensaje: 'Hola' })).toBe('Hola');
    expect(parseSyncReply({ output: ' ok ' })).toBe('ok');
    expect(parseSyncReply({ other: 1 })).toBeNull();
    expect(parseSyncReply('x')).toBeNull();
  });
});

describe('parseInbound', () => {
  it('exige correo válido y mensaje', () => {
    expect(parseInbound({ correo: 'A@b.co', mensaje: 'Respuesta' })).toEqual({
      correo: 'a@b.co',
      mensaje: 'Respuesta',
      conversacionId: null,
    });
    expect(parseInbound({ correo: 'sin-arroba', mensaje: 'x' })).toBeNull();
    expect(parseInbound({ correo: 'a@b.co' })).toBeNull();
  });
});

describe('secretMatches', () => {
  it('compara en tiempo constante y acepta todo si no hay secreto configurado', () => {
    expect(secretMatches('abc', 'abc')).toBe(true);
    expect(secretMatches('abc', 'abd')).toBe(false);
    expect(secretMatches('abc', undefined)).toBe(false);
    expect(secretMatches(null, undefined)).toBe(true);
  });
});

describe('resolveConversationId', () => {
  const fresh = () => 'nuevo';
  const now = new Date('2026-09-15T10:00:00Z');
  const window = 60 * MIN; // dos ventanas de 30 min
  it('reutiliza la conversación si hubo actividad dentro de la ventana', () => {
    const last = { conversationId: 'c1', createdAt: new Date(now.getTime() - 20 * MIN) };
    expect(resolveConversationId(last, now, window, fresh)).toBe('c1');
  });
  it('abre otra si pasó la ventana, si está cerrada, si no hay anterior o si se fuerza', () => {
    const old = { conversationId: 'c1', createdAt: new Date(now.getTime() - 90 * MIN) };
    expect(resolveConversationId(old, now, window, fresh)).toBe('nuevo');
    const closed = { conversationId: 'c1', createdAt: now, closed: true };
    expect(resolveConversationId(closed, now, window, fresh)).toBe('nuevo');
    expect(resolveConversationId(null, now, window, fresh)).toBe('nuevo');
    expect(
      resolveConversationId({ conversationId: 'c1', createdAt: now }, now, window, fresh, true),
    ).toBe('nuevo');
  });
  it('acepta conversacionId en el callback', () => {
    expect(
      parseInbound({
        correo: 'a@b.co',
        mensaje: 'x',
        conversacionId: '4F0D99FA-F62B-4A22-A75F-C4EE19A38180',
      })?.conversacionId,
    ).toBe('4f0d99fa-f62b-4a22-a75f-c4ee19a38180');
  });
});

describe('decideInactivityAction', () => {
  const now = new Date('2026-09-15T10:00:00Z');
  const at = (minsAgo: number) => new Date(now.getTime() - minsAgo * MIN);
  const ttl = 30 * MIN;
  it('actividad reciente: no hace nada', () => {
    expect(decideInactivityAction({ status: 'RECEIVED', createdAt: at(10) }, now, ttl)).toBeNull();
  });
  it('30 min en silencio tras actividad real: avisa', () => {
    expect(decideInactivityAction({ status: 'RECEIVED', createdAt: at(31) }, now, ttl)).toBe(
      'nudge',
    );
    expect(decideInactivityAction({ status: 'SENT', createdAt: at(35) }, now, ttl)).toBe('nudge');
  });
  it('30 min tras el aviso sin respuesta: cierra', () => {
    expect(decideInactivityAction({ status: 'NUDGE', createdAt: at(31) }, now, ttl)).toBe('close');
    expect(decideInactivityAction({ status: 'NUDGE', createdAt: at(10) }, now, ttl)).toBeNull();
  });
  it('si se saltó la ventana del aviso (barrido caído), cierra directo', () => {
    expect(decideInactivityAction({ status: 'RECEIVED', createdAt: at(65) }, now, ttl)).toBe(
      'close',
    );
  });
  it('ya cerrada: no hace nada', () => {
    expect(decideInactivityAction({ status: 'CLOSED', createdAt: at(200) }, now, ttl)).toBeNull();
  });
});
