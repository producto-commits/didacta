'use client';

/**
 * Copyright (c) VA360 LABS S.L.
 * SPDX-License-Identifier: LicenseRef-Didacta-Sustainable-Use
 */

/// Administración → Conexión GHL. Guarda el token con el que Academy llama a
/// GoHighLevel DIRECTAMENTE (sin n8n): hoy aplica etiquetas al completar retos.
/// El endpoint backend es admin-only; la página además oculta el contenido a
/// quien no sea super_admin/tenant_admin (mismo patrón que /admin/impagos).

import { useMemo } from 'react';
import { useTranslations } from 'next-intl';
import { Card, CardContent } from '@/components/ui/card';
import { GhlSettingsCard } from '@/components/admin/ghl-settings-card';
import { authStorage } from '@/lib/auth-storage';

export default function AdminConexionGhlPage() {
  const t = useTranslations('adminGhl');
  const roles = useMemo(() => authStorage.getSession()?.user.roles ?? [], []);
  const canManage = roles.includes('super_admin') || roles.includes('tenant_admin');

  return (
    <div className="mx-auto max-w-4xl space-y-4">
      <div>
        <h1 className="text-xl font-bold text-text">{t('title')}</h1>
        <p className="mt-1 text-sm text-text-muted">{t('subtitle')}</p>
      </div>
      {canManage ? (
        <GhlSettingsCard />
      ) : (
        <Card>
          <CardContent className="p-6 text-sm text-danger-700">{t('notAllowed')}</CardContent>
        </Card>
      )}
    </div>
  );
}
