'use client';

/**
 * Copyright (c) VA360 LABS S.L.
 * SPDX-License-Identifier: LicenseRef-Didacta-Sustainable-Use
 */

/**
 * Banner de la misión de bienvenida "Regístrate en Dropi". Se pinta arriba de
 * los cursos SOLO para alumnos que se dieron de alta por el link público
 * (`registration_source=self_registro`) y que aún no se registraron en Dropi.
 * Se oculta solo cuando el webhook entrante de GHL marca `dropi_registered_at`.
 *
 * Autónomo: pregunta su estado a `GET /api/v1/me/dropi-mission` y, si no está
 * pendiente (o falla), no renderiza nada.
 */

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { apiFetch } from '@/lib/api-client';
import { authStorage } from '@/lib/auth-storage';

interface DropiMission {
  pending: boolean;
  registerUrl: string;
}

export function DropiMissionBanner(): React.JSX.Element | null {
  const t = useTranslations('alumnoAprendizaje');
  const [mission, setMission] = useState<DropiMission | null>(null);

  useEffect(() => {
    let cancelled = false;
    const token = authStorage.getAccessToken();
    if (!token) return;
    void apiFetch<DropiMission>('/api/v1/me/dropi-mission', { method: 'GET' }, token)
      .then((m) => {
        if (!cancelled) setMission(m);
      })
      .catch(() => {
        // Sin misión visible si falla (no es crítico).
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (!mission?.pending) return null;

  return (
    <div
      role="status"
      className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-brand-200 bg-brand-50 px-5 py-4"
      data-testid="dropi-mission-banner"
    >
      <div className="min-w-0">
        <p className="text-xs font-semibold uppercase tracking-wide text-brand-700">
          {t('dropiMission.eyebrow')}
        </p>
        <p className="mt-0.5 font-display text-lg font-bold text-text">{t('dropiMission.title')}</p>
        <p className="mt-1 max-w-2xl text-sm text-text-muted">{t('dropiMission.body')}</p>
      </div>
      <a
        href={mission.registerUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex shrink-0 items-center gap-2 rounded-lg bg-brand-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-brand-700"
      >
        {t('dropiMission.cta')}
      </a>
    </div>
  );
}
