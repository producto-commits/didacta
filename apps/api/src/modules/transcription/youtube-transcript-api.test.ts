/**
 * Copyright (c) VA360 LABS S.L.
 * SPDX-License-Identifier: LicenseRef-Didacta-Sustainable-Use
 */

import { describe, it, expect } from 'vitest';
import {
  buildTranscriptApiUrl,
  parseTranscriptApiResponse,
  transcriptApiConfigFromEnv,
  fetchYoutubeTranscriptViaApi,
} from './youtube-transcript-api';

describe('transcriptApiConfigFromEnv', () => {
  it('null si no hay API key', () => {
    expect(transcriptApiConfigFromEnv({})).toBeNull();
  });

  it('lee key/endpoint/lang con defaults', () => {
    expect(transcriptApiConfigFromEnv({ TRANSCRIPTAPI_KEY: 'k' })).toEqual({
      apiKey: 'k',
      endpoint: 'https://transcriptapi.com/api/v2/youtube/transcript',
      language: 'es',
    });
  });
});

describe('buildTranscriptApiUrl', () => {
  it('arma la URL con video_url, format y language', () => {
    const url = buildTranscriptApiUrl('U6MM21LECvw', {
      apiKey: 'k',
      endpoint: 'https://transcriptapi.com/api/v2/youtube/transcript',
      language: 'es',
    });
    const u = new URL(url);
    expect(u.searchParams.get('video_url')).toBe('U6MM21LECvw');
    expect(u.searchParams.get('format')).toBe('json');
    expect(u.searchParams.get('language')).toBe('es');
  });
});

describe('parseTranscriptApiResponse', () => {
  it('aplana el array transcript a texto plano', () => {
    const data = {
      language: 'es',
      transcript: [
        { text: 'Hola', start: 0, duration: 1 },
        { text: 'mundo', start: 1, duration: 1 },
      ],
    };
    expect(parseTranscriptApiResponse(data)).toBe('Hola mundo');
  });

  it('vacío si no hay array transcript', () => {
    expect(parseTranscriptApiResponse({})).toBe('');
    expect(parseTranscriptApiResponse(null)).toBe('');
  });
});

describe('fetchYoutubeTranscriptViaApi', () => {
  const config = {
    apiKey: 'k',
    endpoint: 'https://transcriptapi.com/api/v2/youtube/transcript',
    language: 'es',
  };

  it('devuelve el texto y manda el Bearer', async () => {
    let seenAuth = '';
    const fakeFetch = (async (_url: string, init?: RequestInit) => {
      seenAuth = String((init?.headers as Record<string, string>)?.Authorization ?? '');
      return new Response(JSON.stringify({ transcript: [{ text: 'clase' }, { text: 'uno' }] }), {
        status: 200,
      });
    }) as unknown as typeof fetch;
    const text = await fetchYoutubeTranscriptViaApi('vid', config, { fetchImpl: fakeFetch });
    expect(text).toBe('clase uno');
    expect(seenAuth).toBe('Bearer k');
  });

  it('null si el servicio responde error o sin transcript', async () => {
    const err = (async () => new Response('no', { status: 402 })) as typeof fetch;
    expect(await fetchYoutubeTranscriptViaApi('v', config, { fetchImpl: err })).toBeNull();
    const empty = (async () =>
      new Response(JSON.stringify({ transcript: [] }), { status: 200 })) as typeof fetch;
    expect(await fetchYoutubeTranscriptViaApi('v', config, { fetchImpl: empty })).toBeNull();
  });
});
