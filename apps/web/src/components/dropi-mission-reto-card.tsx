'use client';

/**
 * Copyright (c) VA360 LABS S.L.
 * SPDX-License-Identifier: LicenseRef-Didacta-Sustainable-Use
 */

/**
 * "Reto 0 — Regístrate en Dropi" pintado en la COLUMNA DE RETOS del curso,
 * encima del reto de la lección. A diferencia del banner superior, va dentro
 * del panel de retos para que el alumno lo lea como el reto que precede a
 * "Reto 1". Es presentacional: el lesson-player decide si mostrarlo (misión
 * pendiente: alta por link público + aún sin cuenta en Dropi) y le pasa la URL.
 */

import { useTranslations } from 'next-intl';

export function DropiMissionRetoCard({ registerUrl }: { registerUrl: string }): React.JSX.Element {
  const t = useTranslations('alumnoAprendizaje');

  return (
    <div
      className="rounded-2xl border border-brand-200 bg-brand-50 p-5"
      data-testid="dropi-mission-reto-card"
    >
      <p className="text-xs font-semibold uppercase tracking-wide text-brand-700">
        {t('dropiMission.retoLabel')} · {t('dropiMission.eyebrow')}
      </p>
      <p className="mt-1 font-display text-lg font-bold text-text">{t('dropiMission.title')}</p>
      <p className="mt-1.5 text-sm text-text-muted">{t('dropiMission.body')}</p>
      <a
        href={registerUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-lg bg-brand-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-brand-700"
      >
        {t('dropiMission.cta')}
      </a>
    </div>
  );
}
