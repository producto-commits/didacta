/**
 * Copyright (c) VA360 LABS S.L.
 * SPDX-License-Identifier: LicenseRef-Didacta-Sustainable-Use
 */

import { describe, it, expect } from 'vitest';
import {
  resolveConversationId,
  buildOutboundPayload,
  danaConfigFromEnv,
  parseInbound,
  parseSyncReply,
  secretMatches,
} from './dana-protocol';

describe('danaConfigFromEnv', () => {
  it('null sin URL; lee secreto y timeout con default', () => {
    expect(danaConfigFromEnv({})).toBeNull();
    expect(
      danaConfigFromEnv({ DANA_WEBHOOK_URL: 'https://n8n/x', DANA_WEBHOOK_SECRET: 's' }),
    ).toEqual({
      webhookUrl: 'https://n8n/x',
      secret: 's',
      timeoutMs: 20_000,
      conversationTtlHours: 24,
    });
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
  it('reutiliza la conversación si hubo actividad dentro del TTL', () => {
    const now = new Date('2026-09-15T10:00:00Z');
    const last = { conversationId: 'c1', createdAt: new Date('2026-09-15T00:00:00Z') };
    expect(resolveConversationId(last, now, 24, fresh)).toBe('c1');
  });
  it('abre otra si pasó el TTL, si no hay anterior o si se fuerza', () => {
    const now = new Date('2026-09-15T10:00:00Z');
    const old = { conversationId: 'c1', createdAt: new Date('2026-09-13T00:00:00Z') };
    expect(resolveConversationId(old, now, 24, fresh)).toBe('nuevo');
    expect(resolveConversationId(null, now, 24, fresh)).toBe('nuevo');
    expect(
      resolveConversationId({ conversationId: 'c1', createdAt: now }, now, 24, fresh, true),
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
