/**
 * Copyright (c) VA360 LABS S.L.
 * SPDX-License-Identifier: LicenseRef-Didacta-Sustainable-Use
 */

import { describe, it, expect } from 'vitest';
import { detectVideoSource, parseYoutubeId } from './video-source';

describe('detectVideoSource', () => {
  it('detecta un mp4 subido por su playbackUrl relativo y extrae la key', () => {
    const url = '/api/v1/storage/video/videos/tenant-1/abc-123.mp4';
    expect(detectVideoSource(url)).toEqual({
      kind: 'storage',
      key: 'videos/tenant-1/abc-123.mp4',
    });
  });

  it('detecta storage aunque el playbackUrl venga absoluto', () => {
    const url = 'https://academia.dropi.co/api/v1/storage/video/videos/t/x.webm';
    expect(detectVideoSource(url)).toEqual({ kind: 'storage', key: 'videos/t/x.webm' });
  });

  it('recorta query/hash de la key de storage', () => {
    const url = '/api/v1/storage/video/videos/t/x.mp4?token=abc#frag';
    expect(detectVideoSource(url)).toEqual({ kind: 'storage', key: 'videos/t/x.mp4' });
  });

  it('detecta YouTube en sus varias formas', () => {
    expect(detectVideoSource('https://www.youtube.com/watch?v=dQw4w9WgXcQ')).toEqual({
      kind: 'youtube',
      videoId: 'dQw4w9WgXcQ',
    });
    expect(detectVideoSource('https://youtu.be/dQw4w9WgXcQ')).toEqual({
      kind: 'youtube',
      videoId: 'dQw4w9WgXcQ',
    });
    expect(detectVideoSource('https://www.youtube.com/embed/dQw4w9WgXcQ?rel=0')).toEqual({
      kind: 'youtube',
      videoId: 'dQw4w9WgXcQ',
    });
  });

  it('marca unknown para embeds externos que no sabemos transcribir', () => {
    expect(detectVideoSource('https://vimeo.com/123456')).toEqual({ kind: 'unknown' });
    expect(detectVideoSource('https://www.loom.com/share/abc')).toEqual({ kind: 'unknown' });
  });

  it('marca unknown para vacío o no-string', () => {
    expect(detectVideoSource('')).toEqual({ kind: 'unknown' });
    expect(detectVideoSource('   ')).toEqual({ kind: 'unknown' });
    expect(detectVideoSource(undefined)).toEqual({ kind: 'unknown' });
    expect(detectVideoSource(42)).toEqual({ kind: 'unknown' });
  });
});

describe('parseYoutubeId', () => {
  it('acepta shorts, live y m.youtube', () => {
    expect(parseYoutubeId('https://www.youtube.com/shorts/dQw4w9WgXcQ')).toBe('dQw4w9WgXcQ');
    expect(parseYoutubeId('https://youtube.com/live/dQw4w9WgXcQ')).toBe('dQw4w9WgXcQ');
    expect(parseYoutubeId('https://m.youtube.com/watch?v=dQw4w9WgXcQ')).toBe('dQw4w9WgXcQ');
  });

  it('rechaza ids con longitud inválida', () => {
    expect(parseYoutubeId('https://youtu.be/short')).toBeNull();
    expect(parseYoutubeId('https://www.youtube.com/watch?v=tooooooolongid123')).toBeNull();
  });

  it('devuelve null para URLs no-YouTube o basura', () => {
    expect(parseYoutubeId('https://example.com/watch?v=dQw4w9WgXcQ')).toBeNull();
    expect(parseYoutubeId('no soy una url')).toBeNull();
  });
});
