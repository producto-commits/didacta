'use client';

/**
 * Copyright (c) VA360 LABS S.L.
 * SPDX-License-Identifier: LicenseRef-Didacta-Sustainable-Use
 */

/// Administración → Facebook Pixel. Guarda el Pixel ID del tenant; la web lo
/// carga en todas las páginas (PageView) y dispara CompleteRegistration al
/// registrarse un alumno por el link público. Solo super_admin/tenant_admin.

import { useMemo } from 'react';
import { useTranslations } from 'next-intl';
import { Card, CardContent } from '@/components/ui/card';
import { FacebookPixelCard } from '@/components/admin/facebook-pixel-card';
import { authStorage } from '@/lib/auth-storage';

export default function AdminFacebookPixelPage() {
  const t = useTranslations('adminFacebookPixel');
  const roles = useMemo(() => authStorage.getSession()?.user.roles ?? [], []);
  const canManage = roles.includes('super_admin') || roles.includes('tenant_admin');

  return (
    <div className="mx-auto max-w-4xl space-y-4">
      <div>
        <h1 className="text-xl font-bold text-text">{t('title')}</h1>
        <p className="mt-1 text-sm text-text-muted">{t('subtitle')}</p>
      </div>
      {canManage ? (
        <FacebookPixelCard />
      ) : (
        <Card>
          <CardContent className="p-6 text-sm text-danger-700">{t('notAllowed')}</CardContent>
        </Card>
      )}
    </div>
  );
}
