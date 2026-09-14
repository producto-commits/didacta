/**
 * Copyright (c) VA360 LABS S.L.
 * SPDX-License-Identifier: LicenseRef-Didacta-Sustainable-Use
 */

import { describe, it, expect } from 'vitest';
import { listeningMessage, parseYouTubeInfo, withJsApi, YT_STATE_ENDED } from './youtube-watch';

describe('parseYouTubeInfo', () => {
  it('lee currentTime/duration/playerState de un infoDelivery (string JSON u objeto)', () => {
    const msg = {
      event: 'infoDelivery',
      info: { currentTime: 12.5, duration: 300, playerState: 1 },
    };
    expect(parseYouTubeInfo(JSON.stringify(msg))).toEqual({
      currentTime: 12.5,
      duration: 300,
      playerState: 1,
    });
    expect(parseYouTubeInfo(msg)).toEqual({ currentTime: 12.5, duration: 300, playerState: 1 });
  });

  it('acepta onStateChange con el estado como número (0 = terminado)', () => {
    expect(parseYouTubeInfo({ event: 'onStateChange', info: YT_STATE_ENDED })).toEqual({
      playerState: 0,
    });
  });

  it('ignora mensajes ajenos, JSON inválido o infoDelivery sin datos útiles', () => {
    expect(parseYouTubeInfo('not json')).toBeNull();
    expect(parseYouTubeInfo({ event: 'initialDelivery', info: {} })).toBeNull();
    expect(parseYouTubeInfo({ event: 'infoDelivery', info: { volume: 100 } })).toBeNull();
    expect(parseYouTubeInfo(null)).toBeNull();
  });

  it('descarta duration 0 (aún no cargó)', () => {
    expect(
      parseYouTubeInfo({ event: 'infoDelivery', info: { duration: 0, currentTime: 0 } }),
    ).toEqual({
      currentTime: 0,
    });
  });
});

describe('listeningMessage / withJsApi', () => {
  it('handshake con canal widget', () => {
    expect(JSON.parse(listeningMessage(7))).toEqual({
      event: 'listening',
      id: 7,
      channel: 'widget',
    });
  });

  it('añade enablejsapi y origin respetando la query existente', () => {
    expect(withJsApi('https://www.youtube.com/embed/abc?rel=0', 'https://app.test')).toBe(
      'https://www.youtube.com/embed/abc?rel=0&enablejsapi=1&origin=https%3A%2F%2Fapp.test',
    );
    expect(withJsApi('https://www.youtube.com/embed/abc', 'https://app.test')).toContain(
      '?enablejsapi=1',
    );
  });
});
