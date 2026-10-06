'use client';

/**
 * Copyright (c) VA360 LABS S.L.
 * SPDX-License-Identifier: LicenseRef-Didacta-Sustainable-Use
 */

/**
 * Carga el Pixel de Facebook del tenant (si tiene `facebookPixelId` configurado)
 * SOLO para inicializarlo — NO dispara PageView ni ningún evento automático. Va
 * en el layout raíz para que `window.fbq` exista en todas las páginas, pero los
 * únicos eventos que se envían son los explícitos del negocio: `Registro` (form
 * de registro) e `Ingreso` (login a Academy). Ver `lib/facebook-pixel.ts`.
 *
 * El `facebookPixelId` sale del tenant-context (resuelto por host, público). El
 * admin lo valida como numérico (6-20 dígitos), así que es seguro interpolarlo
 * en el script inline.
 */

import Script from 'next/script';
import { useTenantContext } from '@/lib/tenant-context';

export function FacebookPixel(): React.JSX.Element | null {
  const { tenant } = useTenantContext();
  const pixelId = tenant?.facebookPixelId;
  if (!pixelId || !/^[0-9]{6,20}$/.test(pixelId)) return null;

  return (
    <Script id="fb-pixel-base" strategy="afterInteractive">
      {`!function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){n.callMethod?n.callMethod.apply(n,arguments):n.queue.push(arguments)};if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';n.queue=[];t=b.createElement(e);t.async=!0;t.src=v;s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s)}(window,document,'script','https://connect.facebook.net/en_US/fbevents.js');fbq('init','${pixelId}');`}
    </Script>
  );
}
