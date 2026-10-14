# Staging (GCP Cloud Run)

Entorno de **staging aislado** para probar antes de producción. Es una **copia
de prod** (clon de la instancia Cloud SQL) con su propia base, Redis aislado y
bucket/VPC compartidos.

- **URL:** https://dropi-academy-staging-840581612044.us-central1.run.app
- **Servicio Cloud Run:** `dropi-academy-staging` (region `us-central1`)
- **BD:** instancia clon `dropi-academy-db-stg`, base `didacta_prod` (copia de prod)
- **Redis:** mismo host que prod, **DB index `/1`** (aislado de prod `/0`)
- **Imagen:** la misma del registry que prod (`...didacta:beta9-dropi-<sha>`)

## Login

Los usuarios son los **mismos de prod** (el clon copia hashes, roles y estado),
así que entran con **las mismas credenciales**. Útil para probar con las cuentas
reales sin tocar prod.

## Montar / recrear el staging

```bash
gcloud auth login
gcloud auth application-default login   # cloud-sql-proxy usa ADC
bash infra/gcp/setup-staging.sh [IMAGEN]
```

El script: clona la instancia, crea los secretos de staging
(`STAGING_ADMIN_DATABASE_URL`, `STAGING_REDIS_URL`), despliega el servicio y
registra el host de staging en `tenant_domain`.

> **Nota:** el paso del `tenant_domain` puede colgarse si las ADC caducaron
> (`invalid_rapt`) o queda un `cloud-sql-proxy` viejo. Si pasa, córrelo aparte
> con timeout (ver abajo). Sin ese registro, la app da 500 (no resuelve el tenant).

### Registrar el host a mano (si el paso 4 falla)

```bash
pkill -9 -f cloud-sql-proxy; sleep 2
cloud-sql-proxy dropi-academy:us-central1:dropi-academy-db-stg --port 5439 & sleep 12
PROD_ADMIN=$(gcloud secrets versions access latest --secret=ADMIN_DATABASE_URL)
PGUSER=$(printf '%s' "$PROD_ADMIN" | sed -E 's#^postgresql://([^:]+):.*#\1#')
PGPASS=$(printf '%s' "$PROD_ADMIN" | sed -E 's#^postgresql://[^:]+:([^@]+)@.*#\1#')
PGPASSWORD="$PGPASS" PGCONNECT_TIMEOUT=15 psql -h 127.0.0.1 -p 5439 -U "$PGUSER" -d didacta_prod -v ON_ERROR_STOP=1 \
  -c "SET statement_timeout='20s'; SET ROLE didacta_super;
      INSERT INTO tenant_domain (id, tenant_id, hostname, is_primary, is_verified, surface, created_at, updated_at)
      SELECT gen_random_uuid(), tenant_id, 'dropi-academy-staging-840581612044.us-central1.run.app', false, true, 'APP', now(), now()
      FROM tenant_domain WHERE hostname='academia.dropi.co'
      ON CONFLICT (hostname) DO UPDATE SET is_verified=true;"
pkill -9 -f cloud-sql-proxy
```

## Desplegar un cambio a staging (sin recrear todo)

Construida la imagen `...didacta:beta9-dropi-<sha>`:

```bash
gcloud run services update dropi-academy-staging --project=dropi-academy \
  --region=us-central1 \
  --image=us-central1-docker.pkg.dev/dropi-academy/didacta/didacta:beta9-dropi-<sha>
```

## Costo: pausar el clon cuando no se use

La instancia clon cobra mientras corre. Pausarla:

```bash
gcloud sql instances patch dropi-academy-db-stg --activation-policy=NEVER
```

Reanudar: `--activation-policy=ALWAYS`.
