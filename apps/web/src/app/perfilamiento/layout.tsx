/**
 * Copyright (c) VA360 LABS S.L.
 * SPDX-License-Identifier: LicenseRef-Didacta-Sustainable-Use
 */

import type { ReactNode } from 'react';

/**
 * Layout del perfilamiento (diagnóstico inicial). Fuera del shell `(app)`, igual
 * que el onboarding: es bloqueante y se muestra sin sidebar ni header. Centrado,
 * con la decoración de fondo de las pantallas de auth. El branding del tenant lo
 * aplica el `TenantThemeProvider` del root layout.
 */
export default function PerfilamientoLayout({ children }: { children: ReactNode }) {
  return (
    <main className="relative flex min-h-dvh items-center justify-center overflow-hidden bg-bg p-4">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 overflow-hidden"
        style={{ zIndex: 0 }}
      >
        <div
          className="absolute -left-32 -top-32 h-96 w-96 rounded-full opacity-30 blur-3xl"
          style={{ backgroundColor: 'hsl(var(--brand-h) 80% 88%)' }}
        />
        <div
          className="absolute -bottom-32 -right-32 h-[28rem] w-[28rem] rounded-full opacity-20 blur-3xl"
          style={{ backgroundColor: 'hsl(174 70% 80%)' }}
        />
      </div>
      <div className="relative z-10 w-full max-w-xl py-8">{children}</div>
    </main>
  );
}
