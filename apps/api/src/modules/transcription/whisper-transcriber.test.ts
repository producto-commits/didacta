/**
 * Copyright (c) VA360 LABS S.L.
 * SPDX-License-Identifier: LicenseRef-Didacta-Sustainable-Use
 */

import { describe, it, expect } from 'vitest';
import {
  buildTranscriptionRequest,
  whisperConfigFromEnv,
  transcribeStorageVideo,
} from './whisper-transcriber';

describe('buildTranscriptionRequest', () => {
  it('manda la URL firmada y el idioma, con Authorization si hay key', () => {
    const req = buildTranscriptionRequest('https://minio/signed.mp4', {
      endpoint: 'https://whisper.local/transcribe',
      apiKey: 'secret',
      language: 'es',
    });
    expect(req.url).toBe('https://whisper.local/transcribe');
    expect(req.headers['Authorization']).toBe('Bearer secret');
    expect(JSON.parse(req.body)).toEqual({ url: 'https://minio/signed.mp4', language: 'es' });
  });

  it('sin key no incluye Authorization y usa es por defecto', () => {
    const req = buildTranscriptionRequest('u', { endpoint: 'e' });
    expect(req.headers['Authorization']).toBeUndefined();
    expect(JSON.parse(req.body).language).toBe('es');
  });
});

describe('whisperConfigFromEnv', () => {
  it('null si no hay endpoint configurado', () => {
    expect(whisperConfigFromEnv({})).toBeNull();
  });

  it('lee endpoint/key/lang del entorno', () => {
    const cfg = whisperConfigFromEnv({
      TRANSCRIPTION_WHISPER_URL: 'https://w/transcribe',
      TRANSCRIPTION_WHISPER_KEY: 'k',
      TRANSCRIPTION_WHISPER_LANG: 'en',
    });
    expect(cfg).toMatchObject({ endpoint: 'https://w/transcribe', apiKey: 'k', language: 'en' });
  });
});

describe('transcribeStorageVideo', () => {
  it('devuelve el texto que responde el servicio', async () => {
    const fakeFetch = (async () =>
      new Response(JSON.stringify({ text: '  hola mundo  ' }), { status: 200 })) as typeof fetch;
    const text = await transcribeStorageVideo(
      'https://minio/signed.mp4',
      { endpoint: 'e' },
      { fetchImpl: fakeFetch },
    );
    expect(text).toBe('hola mundo');
  });

  it('null si el servicio responde error o sin texto', async () => {
    const err = (async () => new Response('nope', { status: 500 })) as typeof fetch;
    expect(await transcribeStorageVideo('u', { endpoint: 'e' }, { fetchImpl: err })).toBeNull();
    const empty = (async () =>
      new Response(JSON.stringify({ text: '' }), { status: 200 })) as typeof fetch;
    expect(await transcribeStorageVideo('u', { endpoint: 'e' }, { fetchImpl: empty })).toBeNull();
  });
});
