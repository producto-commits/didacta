#!/usr/bin/env bash
# ============================================================================
# Staging por CLON de la instancia Cloud SQL (confiable, server-side; evita el
# pg_dump que se cuelga por la RLS forzada).
#   - Clona dropi-academy-db -> dropi-academy-db-stg (misma data/roles/RLS)
#   - Servicio dropi-academy-staging apunta al clon (db didacta_prod del clon)
#   - Redis /1, GCS/VPC/SA compartidos
# Idempotente. Uso: ./setup-staging-clone.sh [IMAGEN]
# ============================================================================
set -euo pipefail

PROJECT_ID=dropi-academy
REGION=us-central1
SRC_INSTANCE=dropi-academy-db
STG_INSTANCE=dropi-academy-db-stg
STG_SERVICE=dropi-academy-staging
CLONE_DB=didacta_prod   # el clon conserva el nombre de BD de prod
RUNTIME_SA="dropi-academy-run@${PROJECT_ID}.iam.gserviceaccount.com"
IMAGE="${1:-us-central1-docker.pkg.dev/dropi-academy/didacta/didacta:beta9-dropi-5a2e5dd}"
PROXY_PORT=5434
gcloud config set project "$PROJECT_ID" >/dev/null
echo "== Imagen: $IMAGE"

echo "== 1) Clonar la instancia (server-side, varios minutos) =="
if gcloud sql instances describe "$STG_INSTANCE" >/dev/null 2>&1; then
  echo "   ya existe $STG_INSTANCE, se reutiliza."
else
  gcloud sql instances clone "$SRC_INSTANCE" "$STG_INSTANCE"
fi

echo "== 2) Secreto admin de staging -> clon (db ${CLONE_DB}) =="
PROD_ADMIN=$(gcloud secrets versions access latest --secret=ADMIN_DATABASE_URL)
STG_ADMIN=$(printf '%s' "$PROD_ADMIN" | sed "s#:${SRC_INSTANCE}&#:${STG_INSTANCE}\&#")
printf '%s' "$STG_ADMIN" | gcloud secrets versions add STAGING_ADMIN_DATABASE_URL --data-file=- >/dev/null
gcloud secrets add-iam-policy-binding STAGING_ADMIN_DATABASE_URL \
  --member="serviceAccount:${RUNTIME_SA}" --role="roles/secretmanager.secretAccessor" >/dev/null 2>&1 || true
# Redis /1 (si el secreto no existe aún)
if ! gcloud secrets describe STAGING_REDIS_URL >/dev/null 2>&1; then
  PROD_REDIS=$(gcloud secrets versions access latest --secret=REDIS_URL)
  printf '%s' "$(printf '%s' "$PROD_REDIS" | sed -E 's#/[0-9]+$##')/1" \
    | gcloud secrets create STAGING_REDIS_URL --data-file=- --replication-policy=automatic >/dev/null
  gcloud secrets add-iam-policy-binding STAGING_REDIS_URL \
    --member="serviceAccount:${RUNTIME_SA}" --role="roles/secretmanager.secretAccessor" >/dev/null 2>&1 || true
fi

echo "== 3) Desplegar staging (apuntando al clon) =="
WANT=( AUTH_SECRET POSTGRES_APP_PASSWORD DIDACTA_SETUP_TOKEN DANA_WEBHOOK_SECRET \
  FEEDBACK_PASSWORD_WEBHOOK_SECRET INSCRIBE_LINK_WEBHOOK_SECRET SMTP_PASS \
  DIDACTA_LICENSE_KEY AI_CONFIG_ENCRYPTION_KEY TENANT_SETTINGS_ENC_KEY )
MAP="ADMIN_DATABASE_URL=STAGING_ADMIN_DATABASE_URL:latest,REDIS_URL=STAGING_REDIS_URL:latest"
for K in "${WANT[@]}"; do
  gcloud secrets describe "$K" >/dev/null 2>&1 && MAP="${MAP},${K}=${K}:latest"
done

gcloud run deploy "$STG_SERVICE" \
  --image="$IMAGE" --region="$REGION" \
  --service-account="$RUNTIME_SA" \
  --port=3000 --cpu=2 --memory=2Gi --no-cpu-throttling \
  --min-instances=0 --max-instances=2 \
  --add-cloudsql-instances="${PROJECT_ID}:${REGION}:${STG_INSTANCE}" \
  --vpc-connector=didacta-redis --vpc-egress=private-ranges-only \
  --timeout=300 \
  --set-env-vars="NODE_ENV=production,DIDACTA_CORE_VERSION=0.1.0-beta.9,API_PORT=4000,WEB_PORT=3000,API_INTERNAL_URL=http://localhost:4000,STORAGE_DRIVER=gcs,GCS_BUCKET=dropi-academy-uploads,INSCRIBE_LINK_WEBHOOK_URL=https://n8n-n8n.ojjmzk.easypanel.host/webhook/link-didacta,FEEDBACK_PASSWORD_WEBHOOK_URL=https://n8n-n8n.ojjmzk.easypanel.host/webhook/feedback-password" \
  --set-secrets="$MAP"

RUN_URL=$(gcloud run services describe "$STG_SERVICE" --region="$REGION" --format='value(status.url)')
RUN_HOST=${RUN_URL#https://}
gcloud run services update "$STG_SERVICE" --region="$REGION" \
  --update-env-vars="WEB_PUBLIC_URL=${RUN_URL},WEB_PUBLIC_ALLOWED_HOSTS=${RUN_HOST}" >/dev/null

echo "== 4) Registrar el host de staging en tenant_domain (BD del CLON) =="
PGUSER=$(printf '%s' "$PROD_ADMIN" | sed -E 's#^postgresql://([^:]+):.*#\1#')
PGPASS=$(printf '%s' "$PROD_ADMIN" | sed -E 's#^postgresql://[^:]+:([^@]+)@.*#\1#')
cloud-sql-proxy "${PROJECT_ID}:${REGION}:${STG_INSTANCE}" --port "$PROXY_PORT" >/tmp/stgproxy.log 2>&1 &
PROXY_PID=$!
trap 'kill "$PROXY_PID" 2>/dev/null || true' EXIT
sleep 7
PGPASSWORD="$PGPASS" psql -h 127.0.0.1 -p "$PROXY_PORT" -U "$PGUSER" -d "$CLONE_DB" -v ON_ERROR_STOP=1 <<SQL || echo "   !! INSERT falló (ver error)"
SET ROLE didacta_super;
INSERT INTO tenant_domain (id, tenant_id, hostname, is_primary, is_verified, surface, created_at, updated_at)
SELECT gen_random_uuid(), tenant_id, '${RUN_HOST}', false, true, 'APP', now(), now()
FROM tenant_domain WHERE hostname = 'academia.dropi.co'
ON CONFLICT (hostname) DO UPDATE SET is_verified = true;
SQL

echo
echo "============================================================"
echo "  STAGING listo:  ${RUN_URL}"
echo "  BD: clon ${STG_INSTANCE}/${CLONE_DB} · Redis /1 · min 0"
echo "  Para pausar el clon y no pagarlo cuando no lo uses:"
echo "    gcloud sql instances patch ${STG_INSTANCE} --activation-policy=NEVER"
echo "  Reanudar:  gcloud sql instances patch ${STG_INSTANCE} --activation-policy=ALWAYS"
echo "============================================================"
