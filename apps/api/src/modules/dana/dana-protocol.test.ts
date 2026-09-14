/**
 * Copyright (c) VA360 LABS S.L.
 * SPDX-License-Identifier: LicenseRef-Didacta-Sustainable-Use
 */

import { describe, it, expect } from 'vitest';
import {
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
    });
  });
});

describe('buildOutboundPayload', () => {
  it('normaliza correo y recorta el mensaje', () => {
    const p = buildOutboundPayload({
      mensaje: '  hola  ',
      correo: ' Diego@Dropi.co ',
      userId: 'u',
      tenantId: 't',
      messageId: 'm',
    });
    expect(p).toEqual({
      mensaje: 'hola',
      correo: 'diego@dropi.co',
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
