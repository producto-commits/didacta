/**
 * Copyright (c) VA360 LABS S.L.
 * SPDX-License-Identifier: LicenseRef-Didacta-Sustainable-Use
 */

import { getTranslations } from 'next-intl/server';
import { RegistroForm } from './registro-form';
import { AuthHeading } from '../auth-heading';

export async function generateMetadata() {
  const t = await getTranslations('auth');
  return {
    title: t('registro.metaTitle'),
  };
}

export default async function RegistroPage() {
  const t = await getTranslations('auth');
  return (
    <>
      <AuthHeading title={t('registro.title')} description={t('registro.description')} />
      <RegistroForm />
    </>
  );
}
