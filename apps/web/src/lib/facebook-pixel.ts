/**
 * Copyright (c) VA360 LABS S.L.
 * SPDX-License-Identifier: LicenseRef-Didacta-Sustainable-Use
 */

/**
 * Helpers del Pixel de Facebook. El pixel base lo carga `<FacebookPixel>` (en el
 * layout raíz) leyendo el `facebookPixelId` del tenant-context. Aquí va solo el
 * disparo del evento de registro con advanced matching (correo/teléfono): el
 * propio `fbevents.js` normaliza y hashea (SHA-256) `em/ph/fn/ln` en el cliente
 * antes de enviarlos, así que se le pasan en crudo.
 */

type Fbq = (...args: unknown[]) => void;

declare global {
  interface Window {
    fbq?: Fbq;
    _fbq?: Fbq;
  }
}

/**
 * Dispara `CompleteRegistration` tras un registro exitoso. Re-inicializa el pixel
 * con los datos del usuario (advanced matching) para que Facebook sepa QUIÉN se
 * registró. No-op si el pixel no está cargado (tenant sin Pixel ID).
 */
export function trackRegistration(
  pixelId: string | null | undefined,
  data: { email?: string; phone?: string; firstName?: string; lastName?: string },
  eventId?: string,
): void {
  if (typeof window === 'undefined' || !window.fbq || !pixelId) return;
  window.fbq('init', pixelId, {
    ...(data.email ? { em: data.email } : {}),
    ...(data.phone ? { ph: data.phone } : {}),
    ...(data.firstName ? { fn: data.firstName } : {}),
    ...(data.lastName ? { ln: data.lastName } : {}),
  });
  // `eventID` compartido con la Conversions API (server-side) → Meta deduplica
  // el mismo registro reportado por ambos lados.
  window.fbq('track', 'CompleteRegistration', {}, eventId ? { eventID: eventId } : undefined);
}

export {};
