#!/usr/bin/env bash
# ============================================================================
# Configura Workload Identity Federation (auth SIN llave) para que GitHub
# Actions del repo pueda construir y desplegar a Cloud Run.
#   - SA de deploy: github-deployer@<proj>.iam (run.admin, artifactregistry.writer,
#     iam.serviceAccountUser; + actuar como la SA de runtime de Cloud Run)
#   - Pool/Provider OIDC de GitHub, RESTRINGIDO al repo producto-commits/didacta
# Al final imprime los dos valores que van en GitHub (Variables).
# Idempotente. Uso: bash infra/gcp/setup-cicd-wif.sh
# ============================================================================
set -euo pipefail

PROJECT_ID=dropi-academy
REPO="producto-commits/didacta"      # OWNER/REPO exacto
POOL=github-pool
PROVIDER=github-provider
SA=github-deployer
SA_EMAIL="${SA}@${PROJECT_ID}.iam.gserviceaccount.com"
RUNTIME_SA="dropi-academy-run@${PROJECT_ID}.iam.gserviceaccount.com"

gcloud config set project "$PROJECT_ID" >/dev/null
PROJECT_NUMBER=$(gcloud projects describe "$PROJECT_ID" --format='value(projectNumber)')

echo "== 1) SA de deploy =="
gcloud iam service-accounts describe "$SA_EMAIL" >/dev/null 2>&1 \
  || gcloud iam service-accounts create "$SA" --display-name="GitHub Actions deployer"

echo "== 2) Roles a la SA de deploy =="
for ROLE in roles/run.admin roles/artifactregistry.writer roles/iam.serviceAccountUser; do
  gcloud projects add-iam-policy-binding "$PROJECT_ID" \
    --member="serviceAccount:${SA_EMAIL}" --role="$ROLE" --condition=None >/dev/null
done
# Para desplegar con --service-account=<runtime>, el deployer debe poder actuar como él.
gcloud iam service-accounts add-iam-policy-binding "$RUNTIME_SA" \
  --member="serviceAccount:${SA_EMAIL}" --role="roles/iam.serviceAccountUser" >/dev/null

echo "== 3) Pool + Provider OIDC de GitHub (restringido al repo) =="
gcloud iam workload-identity-pools describe "$POOL" --location=global >/dev/null 2>&1 \
  || gcloud iam workload-identity-pools create "$POOL" --location=global --display-name="GitHub"
gcloud iam workload-identity-pools providers describe "$PROVIDER" \
    --location=global --workload-identity-pool="$POOL" >/dev/null 2>&1 \
  || gcloud iam workload-identity-pools providers create-oidc "$PROVIDER" \
      --location=global --workload-identity-pool="$POOL" \
      --display-name="GitHub OIDC" \
      --issuer-uri="https://token.actions.githubusercontent.com" \
      --attribute-mapping="google.subject=assertion.sub,attribute.repository=assertion.repository" \
      --attribute-condition="assertion.repository=='${REPO}'"

echo "== 4) Permitir que SOLO ese repo impersone la SA de deploy =="
gcloud iam service-accounts add-iam-policy-binding "$SA_EMAIL" \
  --role="roles/iam.workloadIdentityUser" \
  --member="principalSet://iam.googleapis.com/projects/${PROJECT_NUMBER}/locations/global/workloadIdentityPools/${POOL}/attribute.repository/${REPO}" >/dev/null

PROVIDER_RES="projects/${PROJECT_NUMBER}/locations/global/workloadIdentityPools/${POOL}/providers/${PROVIDER}"
echo
echo "============================================================"
echo "  Pon estas VARIABLES en GitHub:"
echo "  (repo → Settings → Secrets and variables → Actions → Variables → New)"
echo
echo "    WIF_PROVIDER = ${PROVIDER_RES}"
echo "    DEPLOYER_SA  = ${SA_EMAIL}"
echo
echo "  Y crea el Environment 'production' (Settings → Environments → New):"
echo "    Required reviewers = tú (y el core). Eso gatea el deploy a prod."
echo "============================================================"
