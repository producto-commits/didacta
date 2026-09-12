'use client';

/**
 * Copyright (c) VA360 LABS S.L.
 * SPDX-License-Identifier: LicenseRef-Didacta-Sustainable-Use
 */

import type { ReactNode } from 'react';
import { useTenantContext } from '@/lib/tenant-context';

/**
 * Layout del route group `(auth)`: pantalla partida al estilo Dropi.
 *  - Sección 1 (izquierda): imagen de marca Dropi Academy a pantalla completa.
 *  - Sección 2 (derecha): logo Dropi Academy + formulario (fuente IBM Plex Sans,
 *    CTA azul), coherente con app.dropi.co/auth/login.
 *
 * En móvil solo se muestra el formulario (la sección 1 se oculta para no
 * empujar el formulario abajo).
 */
export default function AuthLayout({ children }: { children: ReactNode }) {
  const { tenant } = useTenantContext();

  return (
    <main className="min-h-dvh bg-bg-subtle lg:p-6">
      {/* Color de marca del tenant en una pantalla SIN sesión (mod.theming). */}
      {typeof tenant?.brandHue === 'number' ? (
        <style
          dangerouslySetInnerHTML={{
            __html: `:root{--brand-h:${Math.round(tenant.brandHue)};--brand-s:${Math.round(
              tenant.brandSaturation ?? 70,
            )}%;}`,
          }}
        />
      ) : null}

      <div className="mx-auto flex min-h-dvh w-full max-w-[1400px] flex-col overflow-hidden bg-surface lg:min-h-[calc(100dvh-3rem)] lg:flex-row lg:rounded-2xl lg:border lg:border-border-soft lg:shadow-xl">
        {/* ---------------- Sección 1: imagen de marca ---------------- */}
        <aside
          aria-hidden="true"
          className="hidden bg-cover bg-center lg:block lg:w-1/2"
          style={{ backgroundImage: "url('/brand/seccion-1.png')" }}
        />

        {/* ---------------- Sección 2: tarjeta al estilo app.dropi.co ---------------- */}
        <section
          className="auth-pane relative flex flex-1 flex-col items-center justify-center gap-7 px-6 py-12 sm:px-10 lg:w-1/2 lg:px-14 lg:py-14"
          style={{
            backgroundColor: '#ff9d38',
            backgroundImage:
              'radial-gradient(130% 120% at 50% -10%, rgba(255,255,255,0.22) 0%, rgba(255,255,255,0) 45%), linear-gradient(160deg, #ffb15c 0%, #ff9d38 55%, #f5872a 100%)',
          }}
        >
          {/* Logo blanco Dropi sobre el fondo naranja. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/brand/dropi-white.svg" alt="Dropi" className="h-9 w-auto" />

          {/* Tarjeta blanca con el formulario. */}
          <div className="w-full max-w-[26rem] rounded-2xl bg-white p-8 shadow-2xl sm:p-10">
            {children}
          </div>

          <p className="text-xs font-medium text-white/85">© {new Date().getFullYear()} Dropi</p>
        </section>
      </div>
    </main>
  );
}
