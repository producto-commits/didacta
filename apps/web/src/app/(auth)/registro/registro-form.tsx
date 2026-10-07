'use client';

/**
 * Copyright (c) VA360 LABS S.L.
 * SPDX-License-Identifier: LicenseRef-Didacta-Sustainable-Use
 */

/**
 * Formulario del registro público (link de captación). Pide nombres, apellidos,
 * correo y teléfono con selector de indicativo de país. No pide contraseña: al
 * enviar, el backend crea el alumno + el contacto en GHL (Argentina) y manda un
 * email con el enlace para fijar contraseña (la puerta de entrada). Tras enviar
 * mostramos "revisa tu correo".
 */

import { useState, type FormEvent } from 'react';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { NativeSelect } from '@/components/ui/select';
import { ApiHttpError } from '@/lib/api-client';
import { apiErrorMessage } from '@/lib/i18n/api-error';
import { trackRegistration } from '@/lib/facebook-pixel';
import { useTenantContext } from '@/lib/tenant-context';
import { readUtms } from '@/lib/utm';
import { COUNTRIES, DEFAULT_COUNTRY_ISO, flagEmoji, registro } from '@/lib/auth-registro';

export function RegistroForm(): React.JSX.Element {
  const t = useTranslations('auth');
  const tErrors = useTranslations('errors');
  const { tenant } = useTenantContext();
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [countryIso, setCountryIso] = useState(DEFAULT_COUNTRY_ISO);
  const [phone, setPhone] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // "revisa tu correo": se muestra en el acto tras registrar con éxito.
  const [done, setDone] = useState(false);

  async function onSubmit(e: FormEvent): Promise<void> {
    e.preventDefault();
    setError(null);
    const first = firstName.trim();
    const last = lastName.trim();
    const mail = email.trim();
    const digits = phone.replace(/[^0-9]/g, '');
    if (!first || !last) {
      setError(t('registro.nameRequired'));
      return;
    }
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(mail)) {
      setError(t('registro.emailInvalid'));
      return;
    }
    if (digits.length < 6) {
      setError(t('registro.phoneInvalid'));
      return;
    }
    const dial = COUNTRIES.find((c) => c.iso === countryIso)?.dial ?? '+54';
    setPending(true);
    try {
      // UTM de la URL de registro: se mandan al backend para que las reinyecte
      // en el link del correo (no perder la atribución al fijar contraseña).
      const utms = readUtms();
      const res = await registro({
        email: mail,
        firstName: first,
        lastName: last,
        phone: `${dial}${digits}`,
        utm: Object.keys(utms).length ? utms : undefined,
      });
      // Meta: CompleteRegistration desde el navegador (advanced matching con los
      // datos recién ingresados; el `fbclid` de la URL lo captó el pixel al
      // cargar). El `eventID` lo genera el servidor y lo compartimos con el
      // evento server-side (Conversions API) para que Meta deduplique.
      trackRegistration(
        tenant?.facebookPixelId,
        { email: mail, phone: `${dial}${digits}`, firstName: first, lastName: last },
        res.fbEventId,
        utms,
      );
      // SIN auto-login ni rebote a Dropi: mostramos "revisa tu correo". El alumno
      // entra fijando su contraseña desde el enlace del email.
      setDone(true);
    } catch (err) {
      setError(err instanceof ApiHttpError ? apiErrorMessage(err, tErrors) : t('registro.error'));
    } finally {
      setPending(false);
    }
  }

  if (done) {
    return (
      <div
        role="status"
        className="rounded-xl border border-success-200 bg-success-50 p-5 text-sm text-success-800"
        data-testid="registro-done"
      >
        <p className="text-base font-semibold text-success-900">{t('registro.doneTitle')}</p>
        <p className="mt-2">{t('registro.doneBody', { email: email.trim() })}</p>
        <p className="mt-2 text-success-700">{t('registro.doneHint')}</p>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} aria-busy={pending} className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="reg-first">{t('registro.firstName')}</Label>
          <Input
            id="reg-first"
            autoComplete="given-name"
            value={firstName}
            onChange={(e) => setFirstName(e.target.value)}
            placeholder={t('registro.firstNamePlaceholder')}
            required
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="reg-last">{t('registro.lastName')}</Label>
          <Input
            id="reg-last"
            autoComplete="family-name"
            value={lastName}
            onChange={(e) => setLastName(e.target.value)}
            placeholder={t('registro.lastNamePlaceholder')}
            required
          />
        </div>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="reg-email">{t('registro.email')}</Label>
        <Input
          id="reg-email"
          type="email"
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder={t('registro.emailPlaceholder')}
          required
        />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="reg-phone">{t('registro.phone')}</Label>
        <div className="flex gap-2">
          <NativeSelect
            aria-label={t('registro.countryCode')}
            value={countryIso}
            onChange={(e) => setCountryIso(e.target.value)}
            className="w-[7.5rem] shrink-0"
          >
            {COUNTRIES.map((c) => (
              <option key={`${c.iso}-${c.dial}`} value={c.iso}>
                {flagEmoji(c.iso)} {c.dial}
              </option>
            ))}
          </NativeSelect>
          <Input
            id="reg-phone"
            type="tel"
            inputMode="tel"
            autoComplete="tel-national"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder={t('registro.phonePlaceholder')}
            className="flex-1"
            required
          />
        </div>
        <p className="text-xs text-text-subtle">{t('registro.phoneHelp')}</p>
      </div>

      {error ? (
        <div
          role="alert"
          className="rounded-lg border border-danger-100 bg-danger-50 p-3 text-sm text-danger-700"
        >
          {error}
        </div>
      ) : null}

      <Button type="submit" size="lg" className="w-full" disabled={pending}>
        {pending ? t('registro.submitting') : t('registro.submit')}
      </Button>
      <p className="text-center text-xs text-text-subtle">{t('registro.legal')}</p>
    </form>
  );
}
