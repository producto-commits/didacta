'use client';

/**
 * Copyright (c) VA360 LABS S.L.
 * SPDX-License-Identifier: LicenseRef-Didacta-Sustainable-Use
 */

import { useEffect, useMemo, useState } from 'react';
import { Icon } from '@/components/icon';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { tenantSettingsApi } from '@/lib/tenant-settings';
import { MENU_VISIBILITY_CATALOG, MENU_VISIBILITY_ROLES } from '@/lib/sidebar-nav';

/**
 * Admin → «Menú por rol».
 *
 * Deja al administrador elegir qué entradas del menú principal ve cada rol
 * (p.ej. ocultar «Miembros» al estudiante). La config se guarda en el
 * tenant-setting `nav/roleVisibility` = `{ rol: hrefsOcultos[] }`. El sidebar de
 * cada usuario la aplica vía `GET /me/nav-hidden` (ver `me-modules.controller`),
 * que nunca recorta el menú a super_admin/tenant_admin. Por eso aquí las
 * columnas son solo los roles no-admin.
 *
 * El interruptor representa VISIBILIDAD (encendido = lo ve): es lo natural de
 * leer («el estudiante ve Cursos: sí»). Internamente se guarda la lista de
 * OCULTOS, que es lo compacto (lo normal es no ocultar casi nada).
 */

const SCOPE = 'nav';
const KEY = 'roleVisibility';

type HiddenByRole = Record<string, Set<string>>;

function emptyHidden(): HiddenByRole {
  const out: HiddenByRole = {};
  for (const r of MENU_VISIBILITY_ROLES) out[r.key] = new Set<string>();
  return out;
}

export default function MenuPorRolPage() {
  const [hidden, setHidden] = useState<HiddenByRole>(emptyHidden);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const detail = await tenantSettingsApi.get(SCOPE, KEY);
        const raw = (detail.value ?? {}) as Record<string, unknown>;
        const next = emptyHidden();
        for (const r of MENU_VISIBILITY_ROLES) {
          const arr = raw[r.key];
          if (Array.isArray(arr)) next[r.key] = new Set(arr.filter((x) => typeof x === 'string'));
        }
        if (!cancelled) setHidden(next);
      } catch {
        // 404 la primera vez (aún no se guardó nada): se empieza con todo visible.
        if (!cancelled) setHidden(emptyHidden());
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const isVisible = (roleKey: string, href: string) => !hidden[roleKey]?.has(href);

  function toggle(roleKey: string, href: string, visible: boolean) {
    setMsg(null);
    setHidden((prev) => {
      const set = new Set(prev[roleKey] ?? []);
      if (visible) set.delete(href);
      else set.add(href);
      return { ...prev, [roleKey]: set };
    });
  }

  async function save() {
    setSaving(true);
    setMsg(null);
    try {
      const value: Record<string, string[]> = {};
      for (const r of MENU_VISIBILITY_ROLES) {
        const arr = [...(hidden[r.key] ?? [])];
        if (arr.length > 0) value[r.key] = arr;
      }
      await tenantSettingsApi.upsert(SCOPE, KEY, { value });
      // Refresca el sidebar en caliente (el layout escucha este evento).
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new Event('didacta:nav-visibility-changed'));
      }
      setMsg({ kind: 'ok', text: 'Cambios guardados. El menú se actualiza al instante.' });
    } catch {
      setMsg({ kind: 'error', text: 'No se pudieron guardar los cambios. Inténtalo de nuevo.' });
    } finally {
      setSaving(false);
    }
  }

  const totalHidden = useMemo(
    () => MENU_VISIBILITY_ROLES.reduce((n, r) => n + (hidden[r.key]?.size ?? 0), 0),
    [hidden],
  );

  return (
    <div className="mx-auto max-w-4xl space-y-6 px-1 py-2">
      <header className="space-y-1">
        <div className="flex items-center gap-2">
          <Icon name="eye" className="h-6 w-6 text-brand-600" />
          <h1 className="font-display text-2xl font-bold tracking-tight text-text">Menú por rol</h1>
        </div>
        <p className="max-w-2xl text-sm text-text-muted">
          Elige qué entradas del menú ve cada rol. Apaga el interruptor para ocultar una entrada a
          ese rol. Los administradores siempre ven el menú completo, así que no aparecen aquí.
        </p>
      </header>

      {loading ? (
        <Card>
          <CardContent className="py-12 text-center text-sm text-text-muted">Cargando…</CardContent>
        </Card>
      ) : (
        <>
          {MENU_VISIBILITY_CATALOG.map((section) => (
            <Card key={section.section}>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">{section.section}</CardTitle>
                <CardDescription className="sr-only">
                  Visibilidad de {section.section} por rol
                </CardDescription>
              </CardHeader>
              <CardContent className="overflow-x-auto p-0">
                <table className="w-full min-w-[520px] border-collapse text-sm">
                  <thead>
                    <tr className="border-b border-border">
                      <th className="px-4 py-2 text-left font-medium text-text-muted">Entrada</th>
                      {MENU_VISIBILITY_ROLES.map((r) => (
                        <th
                          key={r.key}
                          className="px-3 py-2 text-center font-medium text-text-muted"
                        >
                          {r.label}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {section.items.map((item) => (
                      <tr key={item.href} className="border-b border-border last:border-0">
                        <td className="px-4 py-2.5 font-medium text-text">{item.label}</td>
                        {MENU_VISIBILITY_ROLES.map((r) => (
                          <td key={r.key} className="px-3 py-2.5 text-center">
                            <div className="flex justify-center">
                              <Switch
                                checked={isVisible(r.key, item.href)}
                                onCheckedChange={(v) => toggle(r.key, item.href, v)}
                                aria-label={`${item.label} — ${r.label}: ${
                                  isVisible(r.key, item.href) ? 'visible' : 'oculto'
                                }`}
                              />
                            </div>
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </CardContent>
            </Card>
          ))}

          <div className="sticky bottom-0 flex items-center justify-between gap-3 rounded-card border border-border bg-surface/95 px-4 py-3 shadow-sm backdrop-blur">
            <div className="text-sm">
              {msg ? (
                <span className={msg.kind === 'ok' ? 'text-success-600' : 'text-danger-600'}>
                  {msg.text}
                </span>
              ) : (
                <span className="text-text-muted">
                  {totalHidden === 0
                    ? 'Todo visible para todos los roles.'
                    : `${totalHidden} entrada(s) oculta(s) en total.`}
                </span>
              )}
            </div>
            <Button onClick={save} disabled={saving}>
              {saving ? 'Guardando…' : 'Guardar cambios'}
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
