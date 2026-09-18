'use client';

/**
 * Copyright (c) VA360 LABS S.L.
 * SPDX-License-Identifier: LicenseRef-Didacta-Sustainable-Use
 */

import { useRouter, useSearchParams } from 'next/navigation';
import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ApiHttpError, apiFetch } from '@/lib/api-client';
import { authStorage, type StoredSession } from '@/lib/auth-storage';
import { apiErrorMessage } from '@/lib/i18n/api-error';
import { requestThemeRefresh } from '@/lib/theming';
import { invalidateCommunitySpacesCache } from '@/modules/community';

/** Respuesta de reset-password: con auto-login trae tokens + user; si no, solo message. */
interface ResetPasswordResponse {
  ok: boolean;
  message?: string;
  tokens?: { accessToken: string; refreshToken: string };
  mfaRequired?: boolean;
  user?: StoredSession['user'];
}

export function ResetPasswordForm() {
  const router = useRouter();
  const t = useTranslations('auth');
  const tErrors = useTranslations('errors');
  const searchParams = useSearchParams();
  const token = searchParams?.get('token') ?? '';
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [done, setDone] = useState(false);

  if (!token) {
    return (
      <div role="alert" className="rounded-lg border border-danger-100 bg-danger-50 p-4">
        <h4 className="font-semibold text-danger-700">{t('reset.missingTokenTitle')}</h4>
        <p className="mt-1 text-sm text-text">{t('reset.missingTokenBody')}</p>
      </div>
    );
  }

  async function onSubmit(form: FormData) {
    setError(null);
    setPending(true);

    const newPassword = String(form.get('newPassword'));
    const confirm = String(form.get('confirm'));

    if (newPassword !== confirm) {
      setError(t('reset.passwordsMismatch'));
      setPending(false);
      return;
    }
    if (newPassword.length < 12) {
      setError(t('reset.passwordTooShort'));
      setPending(false);
      return;
    }

    try {
      const res = await apiFetch<ResetPasswordResponse>('/api/v1/auth/reset-password', {
        method: 'POST',
        body: JSON.stringify({ token, newPassword }),
      });
      // Auto-login: si el backend devolvió sesión, entramos directo sin pedir
      // login otra vez. Si no (p. ej. MFA), caemos al login normal.
      if (res.tokens && res.user) {
        authStorage.saveTokens(res.tokens.accessToken, res.tokens.refreshToken, true);
        authStorage.saveSession({ user: res.user, mfaRequired: res.mfaRequired ?? false }, true);
        invalidateCommunitySpacesCache();
        requestThemeRefresh();
        router.push(res.user.onboardingCompletedAt === null ? '/onboarding' : '/');
        return;
      }
      setDone(true);
      // Sin auto-login (MFA u otro): redirige a signin para que inicie sesión.
      setTimeout(() => router.push('/signin'), 2000);
    } catch (e) {
      setError(e instanceof ApiHttpError ? apiErrorMessage(e, tErrors) : t('reset.submitError'));
    } finally {
      setPending(false);
    }
  }

  if (done) {
    return (
      <div role="status" className="rounded-lg border border-success-200 bg-success-50 p-4">
        <h4 className="font-semibold text-success-700">{t('reset.doneTitle')}</h4>
        <p className="mt-1 text-sm text-text">{t('reset.doneBody')}</p>
      </div>
    );
  }

  return (
    <form action={onSubmit} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="newPassword">{t('reset.newPasswordLabel')}</Label>
        <Input
          id="newPassword"
          name="newPassword"
          type="password"
          autoComplete="new-password"
          minLength={12}
          required
          className="h-12"
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="confirm">{t('reset.confirmPasswordLabel')}</Label>
        <Input
          id="confirm"
          name="confirm"
          type="password"
          autoComplete="new-password"
          minLength={12}
          required
          className="h-12"
        />
      </div>

      {error ? (
        <p role="alert" className="text-sm text-danger-700">
          {error}
        </p>
      ) : null}

      <Button type="submit" disabled={pending} size="lg" className="h-13 w-full">
        {pending ? t('reset.submitPending') : t('reset.submit')}
      </Button>
    </form>
  );
}
