/**
 * Copyright (c) VA360 LABS S.L.
 * SPDX-License-Identifier: LicenseRef-Didacta-Sustainable-Use
 */

import { describe, it, expect } from 'vitest';
import {
  extractCaptionTracks,
  pickCaptionTrack,
  parseTimedTextXml,
  type CaptionTrack,
} from './youtube-transcript';

describe('extractCaptionTracks', () => {
  it('aísla captionTracks del HTML y decodifica los \\u0026 del baseUrl', () => {
    const html = `garbage...{"captionTracks":[{"baseUrl":"https://youtube.com/api/timedtext?v=ID\\u0026lang=es","languageCode":"es","kind":"asr"},{"baseUrl":"https://youtube.com/api/timedtext?v=ID\\u0026lang=en","languageCode":"en"}]}...more`;
    const tracks = extractCaptionTracks(html);
    expect(tracks).toHaveLength(2);
    expect(tracks[0]).toEqual({
      baseUrl: 'https://youtube.com/api/timedtext?v=ID&lang=es',
      languageCode: 'es',
      kind: 'asr',
    });
    expect(tracks[1]!.languageCode).toBe('en');
  });

  it('devuelve [] si el HTML no trae captionTracks', () => {
    expect(extractCaptionTracks('<html>sin subtítulos</html>')).toEqual([]);
  });
});

describe('pickCaptionTrack', () => {
  const tracks: CaptionTrack[] = [
    { baseUrl: 'u-en', languageCode: 'en' },
    { baseUrl: 'u-es', languageCode: 'es-419' },
  ];

  it('prefiere español (match por prefijo cubre es-419)', () => {
    expect(pickCaptionTrack(tracks)!.baseUrl).toBe('u-es');
  });

  it('cae a la primera pista si no hay idioma preferido', () => {
    expect(pickCaptionTrack(tracks, ['fr'])!.baseUrl).toBe('u-en');
  });

  it('null si no hay pistas', () => {
    expect(pickCaptionTrack([])).toBeNull();
  });
});

describe('parseTimedTextXml', () => {
  it('extrae segmentos con tiempo y arma el texto plano decodificando entidades', () => {
    const xml =
      `<?xml version="1.0"?><transcript>` +
      `<text start="0.5" dur="2.1">Hola &amp; bienvenidos</text>` +
      `<text start="2.6" dur="1.9">al curso de dropshipping</text>` +
      `</transcript>`;
    const { text, segments } = parseTimedTextXml(xml);
    expect(segments).toEqual([
      { start: 0.5, dur: 2.1, text: 'Hola & bienvenidos' },
      { start: 2.6, dur: 1.9, text: 'al curso de dropshipping' },
    ]);
    expect(text).toBe('Hola & bienvenidos al curso de dropshipping');
  });

  it('salta segmentos vacíos y colapsa espacios', () => {
    const xml = `<text start="0" dur="1">  </text><text start="1" dur="1">algo\n  aquí</text>`;
    const { text, segments } = parseTimedTextXml(xml);
    expect(segments).toHaveLength(1);
    expect(text).toBe('algo aquí');
  });

  it('devuelve vacío si no hay tags text', () => {
    expect(parseTimedTextXml('<transcript></transcript>')).toEqual({ text: '', segments: [] });
  });
});
