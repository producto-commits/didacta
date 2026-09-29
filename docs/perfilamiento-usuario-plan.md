# Plan — Perfilamiento de usuario (diagnóstico inicial)

> Objetivo de producto: llevar al usuario a su **primera orden** lo antes posible y
> con la menor fricción, ruteándolo al onboarding / retos / flujo de WhatsApp según
> su punto de partida. Este documento es el plan técnico de implementación.

## 1. Decisión de momento (el "cuándo")

**Después del login, en el primer ingreso, como paso OBLIGATORIO con gate propio,
justo después del onboarding actual (foto/nombre/idioma) y antes de usar la app.**

- **No antes del login:** hace falta identidad para etiquetar y persistir el perfil.
- **No "en el registro":** en Dropi casi nadie se registra dentro de Academy — entran
  por GHL→`POST /api/v1/inscribe` con enlace mágico, definen contraseña y caen en
  onboarding. El primer login **es** el punto de entrada real.
- **Gate propio con flag `perfilCompletadoAt`** (no "solo usuarios nuevos"): así la
  primera vez que entre un **inactivo** ya existente (que ya tiene
  `onboardingCompletedAt`) también se perfila → cubre "registrado inactivo" y
  "activado inactivo" (Flujos 1 y 2) sin trabajo extra.

**Orden del gate en el shell** (`apps/web/src/app/(app)/layout.tsx`, hoy ya gatea
`mustChangePassword` → `onboarding`/`bienvenida`):

```
mustChangePassword → onboarding (foto/nombre) → PERFILAMIENTO (nuevo) → app
```

**Alcance:** solo **alumnos**. Admin/tenant_admin/formador quedan exentos (igual que
hoy la ruta admin no ve el onboarding de alumno). El gate se salta si el usuario no
tiene rol `alumno` o si `perfilCompletadoAt` ya está.

## 2. Modelo de datos — se REGISTRA en la base de datos

Fuente de verdad en la tabla **`user`** (mismo criterio que `onboarding_completed_at`,
`bio`, `job_title`: no requiere policy RLS nueva, la tabla `user` ya está bajo RLS).

Nuevas columnas (Prisma `model User` en `packages/database/prisma/schema.prisma`):

| Columna (DB)           | Prisma               | Tipo            | Uso                                                                    |
| ---------------------- | -------------------- | --------------- | ---------------------------------------------------------------------- |
| `perfil_completado_at` | `perfilCompletadoAt` | `TIMESTAMPTZ?`  | Gate + "cuándo se perfiló". Null = pendiente.                          |
| `perfil_segmento`      | `perfilSegmento`     | `VarChar(40)?`  | Segmento calculado (ver §3). Para ruteo y analítica.                   |
| `perfil_objetivo`      | `perfilObjetivo`     | `VarChar(40)?`  | Objetivo 30 días (Q5). Para WhatsApp/CTA.                              |
| `perfil_obstaculo`     | `perfilObstaculo`    | `VarChar(40)?`  | Principal freno (Q4).                                                  |
| `perfil_respuestas`    | `perfilRespuestas`   | `Json?` (jsonb) | Las 5 respuestas crudas (auditoría + re-derivar si cambia el scoring). |

**Migración:** `packages/database/prisma/migrations/<ts>_perfilamiento_usuario/migration.sql`
con los `ALTER TABLE "user" ADD COLUMN ...`. Luego `pnpm --filter @didacta/database db:generate`.
En prod el `entrypoint.sh` corre `prisma migrate deploy` al arrancar → se aplica solo.
Al ser columnas nuevas **nullable** no requieren backfill ni tocan `rls.sql`/`grants.sql`.

> Alternativa (si luego se quiere HISTORIAL de re-perfilamientos para analítica fina):
> tabla `mod_perfilamiento` (userId, respuestas jsonb, segmento, createdAt) append-only.
> Cuesta policy RLS + grants. **Recomendado NO hacerlo en la v1** — las columnas en
> `user` ya permiten segmentar y son suficientes; se añade la tabla solo si se pide.

## 3. Segmentación (función pura, testeable)

`packages/…` o `apps/api/src/…/perfilamiento.ts` → `computarPerfil(respuestas)` →
`{ segmento, objetivo, obstaculo }`. Determinista y con tests (control incluido).

Mapa de estados (del brief) a partir de Q1 (experiencia), Q2 (conoce modelo),
Q3 (órdenes en Dropi), Q4 (obstáculo), Q5 (objetivo):

| Señal principal (Q3)                      | + refinamiento             | Segmento              | Flujo                                    |
| ----------------------------------------- | -------------------------- | --------------------- | ---------------------------------------- |
| 0, "recién me registro"                   | Q1 nunca + Q2 no sabe      | `cero_experiencia`    | Reto 1 crítico                           |
| 0, "recién me registro"                   | Q2 entiende, nunca ejecutó | `conoce_concepto`     | Salta explicación básica                 |
| 0, "recién me registro"                   | Q1 vendió fuera de Dropi   | `vendio_fuera`        | Cómo opera Dropi                         |
| 0, "me registré hace tiempo, no arranqué" | —                          | `registrado_inactivo` | **Flujo 1** (reactivación)               |
| ≥1 orden                                  | Q5 = "volver a vender"     | `activado_inactivo`   | **Flujo 2** (reactivación con historial) |
| ≥1 orden                                  | Q5 = "aumentar ventas"     | `activo`              | Crecimiento                              |

`objetivo` = Q5 tal cual; `obstaculo` = Q4 tal cual (guían retos/WhatsApp dentro del
segmento). Valores como enums `snake_case` estables (no el texto visible).

## 4. Pregunta 3 automática desde Dropi (reducir fricción)

El nº de órdenes y la recencia (si "paró") ya los conoce Dropi. **Idealmente Q3 no se
pregunta**: se resuelve del dato de Dropi y se detecta `activado_inactivo` por
última-orden antigua en vez de por Q5.

- **Dependencia a confirmar:** ¿tenemos el conteo/última-orden de Dropi accesible en
  Academy? (campo custom del contacto en GHL enviado en `/inscribe`, o API de Dropi).
- **Fallback:** si no está disponible, se pregunta Q3 (el plan funciona igual). Se deja
  la función de segmentación preparada para recibir el dato externo cuando exista.

## 5. Backend (NestJS, `apps/api`)

Espejo del onboarding (`me.controller.ts` ya tiene `onboarding/status` y `complete`):

- `GET /api/v1/me/perfilamiento/status` → `{ completed, completedAt, segmento }`.
- `POST /api/v1/me/perfilamiento/complete` (body: las respuestas) →
  1. valida respuestas (zod), 2. `computarPerfil(...)`, 3. persiste las 5 columnas,
  2. `auditLog.record('user.perfilamiento.completed')`, 5. **emite evento**
     `user.perfilamiento.completed` con `{ segmento, objetivo, obstaculo }` (para webhook
     a GHL, ver §7), 6. responde. Idempotente (solo `perfil_completado_at IS NULL`).
- **Sesión:** añadir `perfilCompletadoAt` (+ `perfilSegmento`) al claim/sesión en
  `auth.service.ts` (donde ya viaja `onboardingCompletedAt`) y en `me.controller`,
  para que el shell lea el flag sin llamada extra.

## 6. Frontend (Next.js, `apps/web`)

- Ruta nueva **`/perfilamiento`** fuera del shell (como `/onboarding`): wizard de las 5
  preguntas (o tarjeta única scrolleable), selección múltiple, botón "Continuar".
  Al enviar → `POST …/perfilamiento/complete` → `router.replace('/inicio')` (o al
  `intendedPath` guardado). Responsive first (móvil): tap targets grandes, una pregunta
  por pantalla o lista corta.
- **Gate en `apps/web/src/app/(app)/layout.tsx`:** tras pasar el gate de onboarding, si
  el usuario es alumno y `!session.user.perfilCompletadoAt` → `router.replace('/perfilamiento')`.
- Lib `apps/web/src/lib/perfilamiento.ts` con el cliente del endpoint.

## 7. Acciones tras perfilar (el "para qué")

1. **Retos:** ordenar/asignar los retos del segmento (motor de retos ya existe). En v1
   basta con guardar el segmento y que `/inicio`/retos filtren por él; la asignación
   automática se puede iterar.
2. **WhatsApp / GHL:** emitir el webhook `user.perfilamiento.completed` con
   `learner.ghlContactId/ghlLocationId` + `segmento/objetivo` → n8n dispara el flujo de
   WhatsApp correcto. **Reusa la infra de webhooks que ya montamos** (KNOWN_EVENT_TYPES
   - WebhookLearner con IDs de GHL): solo hay que registrar el evento nuevo.
3. **`/inicio`:** copy/CTA por segmento (opcional, iterable).

## 8. i18n + tests

- i18n: las 5 preguntas y opciones en `es` y `en` (`shell`/`onboarding` o namespace
  `perfilamiento`). Nada de texto hardcodeado.
- Tests: `computarPerfil` (unit, puro) — un set "cero_experiencia" y un **control**
  "activo" que demuestre que discrimina; e idempotencia del endpoint.

## 9. Orden de entrega (incremental, verificable)

1. Migración + columnas + `db:generate` (rebuild `@didacta/database`).
2. `computarPerfil` + tests.
3. Endpoints backend + sesión + auditoría + evento webhook (+ registrar el evento).
4. Ruta `/perfilamiento` + gate en el shell + i18n.
5. Verificación real a 375px en el dev local (login como alumno nuevo → cae en
   perfilamiento → responde → aterriza en /inicio; el flag persiste al re-loguear).
6. `pnpm -r build`, `typecheck`, `-r test`, `eslint`; luego imagen + deploy.

## 10. Decisiones a confirmar contigo

- **Q3 automática:** ¿tenemos acceso al conteo/última-orden de Dropi para NO preguntar
  Q3? (define si es 5 o 4 preguntas visibles).
- **Datos en BD:** ¿columnas en `user` (recomendado) o también tabla de historial?
- **Formato UI:** ¿una pregunta por pantalla (más guiado, menos abandono) o las 5 en
  una sola tarjeta (más rápido)?
- **Reto/WhatsApp:** ¿la asignación de retos por segmento entra en v1 o solo guardamos
  el segmento + disparamos el webhook y el ruteo de retos se itera después?
