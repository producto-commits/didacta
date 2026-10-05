'use client';

/**
 * Copyright (c) VA360 LABS S.L.
 * SPDX-License-Identifier: LicenseRef-Didacta-Sustainable-Use
 */

/**
 * Tarjeta de configuración del Pixel de Facebook (Administración → Facebook
 * Pixel). Un solo campo: el Pixel ID. Al guardarlo, la web lo carga en todas las
 * páginas (PageView) y dispara `CompleteRegistration` al registrarse un alumno.
 */

import { useEffect, useState, type FormEvent } from 'react';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { adminFacebookPixelApi } from '@/lib/admin-facebook-pixel';
import { ApiHttpError } from '@/lib/api-client';
import { apiErrorMessage } from '@/lib/i18n/api-error';

interface ToastState {
  variant: 'success' | 'error';
  message: string;
}

export function FacebookPixelCard(): React.JSX.Element {
  const t = useTranslations('adminFacebookPixel');
  const tErrors = useTranslations('errors');
  const [pixelId, setPixelId] = useState('');
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<ToastState | null>(null);

  useEffect(() => {
    let cancelled = false;
    void adminFacebookPixelApi
      .get()
      .then((dto) => {
        if (!cancelled) {
          setPixelId(dto.pixelId ?? '');
          setLoaded(true);
        }
      })
      .catch(() => {
        if (!cancelled) setLoaded(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  async function handleSubmit(e: FormEvent): Promise<void> {
    e.preventDefault();
    setToast(null);
    const value = pixelId.trim();
    if (value && !/^[0-9]{6,20}$/.test(value)) {
      setToast({ variant: 'error', message: t('invalid') });
      return;
    }
    setSaving(true);
    try {
      const dto = await adminFacebookPixelApi.save(value);
      setPixelId(dto.pixelId ?? '');
      setToast({ variant: 'success', message: value ? t('saved') : t('cleared') });
    } catch (err) {
      setToast({
        variant: 'error',
        message: err instanceof ApiHttpError ? apiErrorMessage(err, tErrors) : t('saveError'),
      });
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('title')}</CardTitle>
        <CardDescription>{t('subtitle')}</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} aria-busy={saving} className="grid max-w-md gap-4">
          <div className="space-y-1.5">
            <Label htmlFor="fb-pixel-id">{t('label')}</Label>
            <Input
              id="fb-pixel-id"
              inputMode="numeric"
              value={pixelId}
              onChange={(e) => setPixelId(e.target.value)}
              placeholder={t('placeholder')}
              disabled={!loaded}
            />
            <p className="text-xs text-text-subtle">{t('help')}</p>
          </div>

          {toast ? (
            <div
              role="status"
              aria-live="polite"
              className={
                'rounded-md border p-3 text-sm ' +
                (toast.variant === 'success'
                  ? 'border-success-200 bg-success-50 text-success-700'
                  : 'border-danger-100 bg-danger-50 text-danger-700')
              }
              data-testid="fb-pixel-toast"
            >
              {toast.message}
            </div>
          ) : null}

          <div>
            <Button type="submit" disabled={saving || !loaded}>
              {saving ? t('saving') : t('saveButton')}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
