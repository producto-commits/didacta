# Despliegue en GCP (Cloud Run) — Dropi Academy (Didacta)

Mismo patrón que **Okreta** y **Pulso**: **Docker → Artifact Registry → Cloud Run**,
con **Cloud Build** disparado por push a `main`. La diferencia es que Didacta es
más que una web Next: es **un monorepo con API (NestJS) + Web (Next) en un solo
contenedor**, con **Postgres (RLS + pgvector)**, **Redis (colas BullMQ)** y
**almacenamiento de objetos** (hoy MinIO/S3). Por eso este plan añade **Cloud SQL**,
**Redis** y un **bucket GCS**, encima del mismo esqueleto de Pulso.

- **Región:** `us-central1` (igual que Okreta/Pulso)
- **Proyecto GCP:** nuevo y dedicado — `dropi-academy`
- **Servicio Cloud Run:** `dropi-academy`
- **Imagen:** `us-central1-docker.pkg.dev/<PROJECT_ID>/dropi-academy/app`
- **Repo GitHub que construye:** `producto-commits/didacta` (rama `main`)

> **Modelo elegido:** 1 servicio con **auto-deploy** en cada push a `main` (como
> Pulso). Sin staging ni promoción manual al principio; si más adelante se quiere,
> se clona el patrón de Okreta (`dropi-academy-staging` + guarda de promoción).

> **El dominio va de ÚLTIMO (decisión de negocio).** Se migra y verifica TODO
> sobre la URL automática `https://dropi-academy-XXXX.a.run.app` que da Cloud Run.
> Al final se reserva una **IP estática** (balanceador HTTPS, paso 12) y ESA es la
> IP que se le entrega a la persona de DNS — una IP fija de Google, no un CNAME ni
> la IP de un panel. Cuando den el dominio, se añade el certificado gestionado.

---

## 0. Por qué NO es idéntico a Pulso (lo que Didacta suma)

| Necesidad     | Pulso                 | Didacta (esto)                                               |
| ------------- | --------------------- | ------------------------------------------------------------ |
| App           | 1 proceso Next        | **API NestJS (:4000) + Web Next (:3000) en 1 contenedor**    |
| Base de datos | Supabase (gestionada) | **Cloud SQL Postgres 16 + extensión `pgvector` + roles RLS** |
| Colas / jobs  | crons externos        | **Redis + workers BullMQ dentro del proceso API**            |
| Ficheros      | —                     | **Bucket de objetos** (portadas, videos, PDFs, certificados) |
| Migraciones   | —                     | **`prisma migrate deploy` + RLS/grants/seed al arrancar**    |

**Los dos puertos NO son un problema.** El Web (Next) ya reescribe **todo**
`/api/*` hacia el API interno (`apps/web/next.config.mjs`, `API_INTERNAL_URL`),
así que el Web es la **única puerta**: Cloud Run enruta al puerto del Web y el Web
proxya `/api` al API en `localhost:4000` del mismo contenedor. Se despliega con
`--port=3000` (ver paso 6). No hay que partir el servicio.

**Los workers viven dentro del API.** Los barridos programados (inactividad de
Dana, desbloqueo de lecciones) corren como jobs BullMQ en el proceso API. En
Cloud Run eso exige **`--min-instances=1` + CPU siempre asignada
(`--no-cpu-throttling`)**, o el instance se apaga al quedar ocioso y los jobs no
corren. (Alternativa futura: sacar los barridos a **Cloud Scheduler** pegándole a
un endpoint, como los crons de Pulso.)

---

## 1. Autenticación y variables (una vez, en tu terminal)

```bash
gcloud auth login

export PROJECT_ID=dropi-academy         # id de proyecto nuevo (único global)
export REGION=us-central1
export BILLING_ACCOUNT=XXXXXX-XXXXXX-XXXXXX   # gcloud billing accounts list
```

## 2. Proyecto + APIs

```bash
gcloud projects create "$PROJECT_ID" --name="Dropi Academy"
gcloud billing projects link "$PROJECT_ID" --billing-account="$BILLING_ACCOUNT"
gcloud config set project "$PROJECT_ID"

gcloud services enable \
  run.googleapis.com \
  cloudbuild.googleapis.com \
  artifactregistry.googleapis.com \
  secretmanager.googleapis.com \
  sqladmin.googleapis.com \
  storage.googleapis.com \
  iamcredentials.googleapis.com
```

> Redis = **Upstash** (endpoint público TLS): no hace falta Memorystore ni conector
> VPC. Storage = **GCS nativo keyless**: `iamcredentials` es para firmar las URLs.

## 3. Artifact Registry

```bash
gcloud artifacts repositories create dropi-academy \
  --repository-format=docker --location="$REGION" \
  --description="Imágenes de Dropi Academy"
```

## 4. Cloud SQL — Postgres 16 con pgvector y roles RLS

Didacta fuerza **RLS incluso para el dueño**: el runtime se conecta como
`didacta_app` (rol `NOBYPASSRLS`) y las migraciones/RLS/seed corren con una
conexión **admin**. El entrypoint crea `rls.sql`/`grants.sql`/`seed.sql` al
arrancar; solo hay que darle una conexión admin y tener `pgvector`.

```bash
gcloud sql instances create dropi-academy-db \
  --database-version=POSTGRES_16 --region="$REGION" \
  --tier=db-custom-2-4096 --storage-type=SSD --storage-size=20GB \
  --availability-type=ZONAL          # sube a REGIONAL para HA cuando importe

gcloud sql databases create didacta --instance=dropi-academy-db

# Usuario admin (migraciones + rls.sql/grants.sql/seed.sql).
gcloud sql users create didacta_admin --instance=dropi-academy-db --password='<ADMIN_PASS>'

# pgvector: conéctate una vez y habilítalo (gcloud sql connect o psql) —
#   CREATE EXTENSION IF NOT EXISTS vector;
# El rol de runtime didacta_app y los grants los crea grants.sql al primer arranque.
```

- **Conexión desde Cloud Run:** por socket de Cloud SQL. Se adjunta el instance al
  servicio (`--add-cloudsql-instances`, paso 6) y la URL usa el socket:
  `postgresql://didacta_admin:<ADMIN_PASS>@localhost/didacta?host=/cloudsql/$PROJECT_ID:$REGION:dropi-academy-db&schema=public`
- `ADMIN_DATABASE_URL` = esa URL (la usan migraciones/RLS). El runtime bajará a
  `didacta_app` según `grants.sql` (mismo comportamiento que en EasyPanel hoy).
- **`pgvector` en Cloud SQL** está soportado (extensión `vector`). Si el tutor IA
  usa índices vectoriales, verificar la versión de la extensión tras crear.

## 5. Redis — Upstash (elegido)

Redis es **Upstash** (endpoint público TLS), así Cloud Run lo alcanza directo por
internet: **sin Memorystore y sin conector VPC** (más simple y barato). En la
consola de Upstash, crea una base **Regional** (no Global) — BullMQ mantiene
conexiones persistentes/bloqueantes — y copia la URL del protocolo Redis:

```
rediss://default:<password>@<host>.upstash.io:6379
```

Esa URL va como el **secreto** `REDIS_URL` (paso 8). No se necesita nada en GCP
para Redis.

## 6. Almacenamiento de objetos — GCS nativo, KEYLESS

La organización prohíbe crear llaves de service account
(`constraints/iam.disableServiceAccountKeyCreation`), que es lo que necesitaría el
modo S3 de GCS (claves HMAC). Por eso Didacta usa un **adapter GCS nativo**
(`STORAGE_DRIVER=gcs`, `apps/api/src/modules/gcs-storage.service.ts`): la SA de
runtime autentica por ADC y **firma las URLs V4 vía IAM `signBlob`** — sin llaves.
La subida de video usa un **PUT firmado único** (sin multipart estilo S3): al ir
el navegador directo a GCS no hay proxy que corte el PUT grande.

```bash
# Bucket (ya creado en el bloque de infra)
gsutil mb -l "$REGION" gs://dropi-academy-uploads 2>/dev/null || true

# Para firmar V4 sin llaves, la SA de runtime debe poder llamarse signBlob A SÍ MISMA:
gcloud iam service-accounts add-iam-policy-binding \
  "dropi-academy-run@${PROJECT_ID}.iam.gserviceaccount.com" \
  --member="serviceAccount:dropi-academy-run@${PROJECT_ID}.iam.gserviceaccount.com" \
  --role="roles/iam.serviceAccountTokenCreator"

# CORS del bucket: el navegador sube (PUT) y lee (GET, con Range) directo contra GCS.
cat > /tmp/cors.json <<'JSON'
[{"origin":["*"],"method":["GET","PUT","HEAD"],
  "responseHeader":["Content-Type","Content-Range","Content-Length","ETag"],
  "maxAgeSeconds":3600}]
JSON
gsutil cors set /tmp/cors.json gs://dropi-academy-uploads
```

> Cuando haya dominio final, se puede cerrar el CORS a ese origen en vez de `*`.

Envs de runtime (sin llaves):

```
STORAGE_DRIVER=gcs
GCS_BUCKET=dropi-academy-uploads
```

Requisitos ya cubiertos por los pasos anteriores: API `iamcredentials.googleapis.com`
habilitada (paso 2), y el rol `serviceAccountTokenCreator` de arriba.

## 7. Service Accounts (mínimo privilegio, igual que Okreta/Pulso)

```bash
# Runtime
gcloud iam service-accounts create dropi-academy-run --display-name="Dropi Academy · runtime"
export RUNTIME_SA="dropi-academy-run@${PROJECT_ID}.iam.gserviceaccount.com"
for ROLE in roles/logging.logWriter roles/cloudsql.client; do
  gcloud projects add-iam-policy-binding "$PROJECT_ID" --member="serviceAccount:${RUNTIME_SA}" --role="$ROLE" --condition=None
done
gsutil iam ch serviceAccount:${RUNTIME_SA}:roles/storage.objectUser gs://dropi-academy-uploads

# Cloud Build
gcloud iam service-accounts create dropi-academy-build --display-name="Dropi Academy · Cloud Build"
export BUILD_SA="dropi-academy-build@${PROJECT_ID}.iam.gserviceaccount.com"
for ROLE in roles/run.admin roles/artifactregistry.writer roles/logging.logWriter; do
  gcloud projects add-iam-policy-binding "$PROJECT_ID" --member="serviceAccount:${BUILD_SA}" --role="$ROLE" --condition=None
done
gcloud iam service-accounts add-iam-policy-binding "$RUNTIME_SA" \
  --member="serviceAccount:${BUILD_SA}" --role="roles/iam.serviceAccountUser"
```

## 8. Secretos (Secret Manager)

Un secreto por valor sensible; acceso de lectura a la SA de runtime. Toma los
valores del `.env` de producción actual (EasyPanel).

```bash
# GCS es keyless → NO hay S3_ACCESS_KEY/S3_SECRET_KEY. REDIS_URL (Upstash) es
# secreto porque lleva password.
SECRETOS=( ADMIN_DATABASE_URL AUTH_SECRET REDIS_URL DIDACTA_SETUP_TOKEN \
  DANA_WEBHOOK_SECRET FEEDBACK_PASSWORD_WEBHOOK_SECRET INSCRIBE_LINK_WEBHOOK_SECRET \
  SMTP_PASS DIDACTA_LICENSE_KEY )

# Exporta los valores en tu shell (o en un .env local que NO se commitea):
#   export ADMIN_DATABASE_URL='postgresql://didacta_admin:...@localhost/didacta?host=/cloudsql/dropi-academy:us-central1:dropi-academy-db&schema=public'
#   export REDIS_URL='rediss://default:...@...upstash.io:6379'
#   export AUTH_SECRET=...  (etc.)
for KEY in "${SECRETOS[@]}"; do
  VAL="${!KEY}"; [ -z "$VAL" ] && { echo "· salto $KEY (vacío)"; continue; }
  gcloud secrets describe "$KEY" >/dev/null 2>&1 \
    && printf '%s' "$VAL" | gcloud secrets versions add "$KEY" --data-file=- \
    || printf '%s' "$VAL" | gcloud secrets create "$KEY" --data-file=- --replication-policy=automatic
  gcloud secrets add-iam-policy-binding "$KEY" --member="serviceAccount:${RUNTIME_SA}" --role="roles/secretmanager.secretAccessor"
done
```

## 9. Primer despliegue (crea el servicio con env + secretos + Cloud SQL)

```bash
# 9a. Construye/sube la primera imagen (bootstrap) con cloudbuild.yaml (paso 11).
gcloud builds submit --config=cloudbuild.yaml --region="$REGION" \
  --service-account="projects/$PROJECT_ID/serviceAccounts/$BUILD_SA" \
  --substitutions=SHORT_SHA=bootstrap

# 9b. Fija TODO en el servicio (persiste entre deploys, que solo cambian la imagen).
# Sin dominio todavía: la app se sirve en su URL *.run.app (el dominio va al final).
RUN_URL=$(gcloud run services describe dropi-academy --region="$REGION" --format='value(status.url)')
RUN_HOST=${RUN_URL#https://}
gcloud run services update dropi-academy --region="$REGION" \
  --service-account="$RUNTIME_SA" \
  --allow-unauthenticated \
  --port=3000 \
  --cpu=2 --memory=2Gi --no-cpu-throttling \
  --min-instances=1 --max-instances=4 \
  --add-cloudsql-instances="$PROJECT_ID:$REGION:dropi-academy-db" \
  --timeout=300 \
  --set-env-vars="NODE_ENV=production,DIDACTA_CORE_VERSION=0.1.0-beta.9,\
API_PORT=4000,WEB_PORT=3000,API_INTERNAL_URL=http://localhost:4000,\
WEB_PUBLIC_URL=${RUN_URL},WEB_PUBLIC_ALLOWED_HOSTS=${RUN_HOST},\
STORAGE_DRIVER=gcs,GCS_BUCKET=dropi-academy-uploads,\
INSCRIBE_LINK_WEBHOOK_URL=https://n8n-n8n.ojjmzk.easypanel.host/webhook/link-didacta,\
FEEDBACK_PASSWORD_WEBHOOK_URL=https://n8n-n8n.ojjmzk.easypanel.host/webhook/feedback-password" \
  --set-secrets="ADMIN_DATABASE_URL=ADMIN_DATABASE_URL:latest,AUTH_SECRET=AUTH_SECRET:latest,\
REDIS_URL=REDIS_URL:latest,DIDACTA_SETUP_TOKEN=DIDACTA_SETUP_TOKEN:latest,\
DANA_WEBHOOK_SECRET=DANA_WEBHOOK_SECRET:latest,\
SMTP_PASS=SMTP_PASS:latest,DIDACTA_LICENSE_KEY=DIDACTA_LICENSE_KEY:latest"
```

Notas:

- `--port=3000` → Cloud Run enruta al Web; el Web proxya `/api` al API en `:4000`.
- `--no-cpu-throttling --min-instances=1` → los workers BullMQ siguen vivos.
- `--timeout=300` y arranque: las **migraciones corren al boot** (con lock de
  advisory de Prisma, seguras aunque arranquen varios instances). Si el arranque
  se hace largo, subir el _startup probe_.
- El `ADMIN_DATABASE_URL` (secreto) debe llevar el `host=/cloudsql/…` del paso 4.

## 10. Conectar GitHub + trigger de auto-deploy

```bash
gcloud builds connections create github academy-github --region="$REGION"
# Sigue el link para instalar la app de Cloud Build en producto-commits.
gcloud builds repositories create didacta \
  --remote-uri=https://github.com/producto-commits/didacta.git \
  --connection=academy-github --region="$REGION"

gcloud builds triggers create github \
  --name=dropi-academy-main --region="$REGION" \
  --repository=projects/$PROJECT_ID/locations/$REGION/connections/academy-github/repositories/didacta \
  --branch-pattern='^main$' \
  --build-config=cloudbuild.yaml \
  --service-account="projects/$PROJECT_ID/serviceAccounts/$BUILD_SA"
```

Desde aquí, **cada push a `main`** construye la imagen `linux/amd64` en la nube (se
acabó construir en el Mac) y despliega.

## 11. `cloudbuild.yaml`

Vive en la raíz del repo (creado junto a este doc). Construye la imagen del
monorepo con tag `SHORT_SHA` (+ `latest`), la sube a Artifact Registry y actualiza
el servicio Cloud Run (solo la imagen; env/secretos ya viven en el servicio).

## 12. IP estática (ahora) + dominio (al final)

El objetivo del negocio: entregarle a la persona de DNS **una IP fija de Google**
—no un CNAME ni la IP de un panel—. Eso se consigue poniendo Cloud Run detrás de
un **balanceador HTTPS externo** con una **IP estática reservada**. Se hace en dos
tiempos: la **IP se reserva y el balanceador se arma YA** (durante la migración);
el **certificado y el dominio se cierran al final**, cuando den el dominio.

**12a. Ahora — reservar la IP y armar el balanceador (Serverless NEG → Cloud Run):**

```bash
# IP estática GLOBAL (esta es la IP que se le entrega a DNS)
gcloud compute addresses create dropi-academy-ip --global
gcloud compute addresses describe dropi-academy-ip --global --format='value(address)'   # ← entregar esta IP

# NEG serverless que apunta al servicio Cloud Run
gcloud compute network-endpoint-groups create dropi-academy-neg \
  --region="$REGION" --network-endpoint-type=serverless --cloud-run-service=dropi-academy

# Backend + URL map + proxy HTTP (para arrancar y validar por IP)
gcloud compute backend-services create dropi-academy-be --global --load-balancing-scheme=EXTERNAL_MANAGED
gcloud compute backend-services add-backend dropi-academy-be --global \
  --network-endpoint-group=dropi-academy-neg --network-endpoint-group-region="$REGION"
gcloud compute url-maps create dropi-academy-lb --default-service=dropi-academy-be
gcloud compute target-http-proxies create dropi-academy-http --url-map=dropi-academy-lb
gcloud compute forwarding-rules create dropi-academy-fr-http --global \
  --address=dropi-academy-ip --target-http-proxy=dropi-academy-http --ports=80
```

Con esto ya hay una **IP fija** sirviendo la app (por HTTP). **Esa IP es la que se
le pasa a DNS.** (Mientras, seguimos verificando por la URL `*.run.app`.)

**12b. Al final — cuando den el dominio:** DNS crea un registro **A** del dominio →
esa IP; entonces se emite el **certificado gestionado** (valida contra ese A) y se
añade el proxy HTTPS:

```bash
DOMINIO=academy.dropi.co   # el que den al final
gcloud compute ssl-certificates create dropi-academy-cert --global --domains="$DOMINIO"
gcloud compute target-https-proxies create dropi-academy-https --url-map=dropi-academy-lb --ssl-certificates=dropi-academy-cert
gcloud compute forwarding-rules create dropi-academy-fr-https --global \
  --address=dropi-academy-ip --target-https-proxy=dropi-academy-https --ports=443
# El cert gestionado pasa a ACTIVE en minutos-horas una vez el A apunta a la IP.
# Actualizar entonces WEB_PUBLIC_URL/WEB_PUBLIC_ALLOWED_HOSTS al dominio real:
gcloud run services update dropi-academy --region="$REGION" \
  --update-env-vars="WEB_PUBLIC_URL=https://$DOMINIO,WEB_PUBLIC_ALLOWED_HOSTS=$DOMINIO"
```

> **Alternativa simple SIN IP fija** (si DNS aceptara un CNAME): `gcloud run
domain-mappings create --service=dropi-academy --domain=<dominio>` da registros
> CNAME/A gestionados por Google. Pero como pidieron **IP**, usamos el balanceador
> de 12a.

## 13. Migración de datos desde EasyPanel (una vez)

1. **Postgres:** `pg_dump` de la BD actual (recordar quitar `?schema=public`:
   `pg_dump "${ADMIN_DATABASE_URL%%\?*}" -Fc -f dump.pgc`) → `pg_restore` al Cloud
   SQL (crear antes `CREATE EXTENSION vector`). Los roles RLS los rehace
   `grants.sql` al primer arranque.
2. **Objetos:** copiar el bucket MinIO a GCS (`rclone` o `gsutil rsync` vía un
   endpoint S3). Como ya guardamos **rutas estables** (`/api/v1/storage/file/<key>`),
   no hay URLs firmadas persistidas que reescribir: basta que las mismas _keys_
   existan en el bucket nuevo.
3. **Cortes:** apuntar el DNS a Cloud Run cuando la verificación (abajo) esté verde.

## 14. Verificación (con control, como manda el repo)

```bash
URL=$(gcloud run services describe dropi-academy --region=$REGION --format='value(status.url)')
curl -fsS "$URL/healthz"                                   # 200 = API viva tras el proxy del Web
curl -s -o /dev/null -w '%{http_code}\n' "$URL/api/v1/storage/file/tenants/<t>/uploads/probe.webp"  # 302 (S3/GCS) = ruta de storage OK
curl -s "$URL/api/docs.json" | grep -c backgroundUrl       # >0 = imagen nueva (control: build viejo daría 0)
```

Además: login carga con branding Dropi, subir un video de prueba (multipart) y
descargar un certificado (comprueba GCS + pgvector del tutor si aplica).

---

## Resumen de decisiones (para IT)

- **1 servicio Cloud Run**, auto-deploy en push a `main` (como Pulso). Staging +
  promoción manual (como Okreta) se añade después si se quiere.
- **Dominio de último.** Se migra y valida en la URL `*.run.app`. La migración
  entrega una **IP estática** (balanceador HTTPS, paso 12a) para dársela a DNS; el
  dominio + certificado gestionado se cierran al final (12b).
- **Cloud SQL Postgres 16 + pgvector** (no Supabase: Didacta necesita roles RLS
  propios y extensiones). **Memorystore Redis + VPC connector** (o Upstash).
- **GCS por interoperabilidad S3** (sin tocar código; validar multipart de video,
  fallback MinIO-en-GCE).
- **Puerto único** `--port=3000`: el Web ya proxya `/api`. **Workers vivos** con
  `--min-instances=1 --no-cpu-throttling`.
- **Migraciones al boot** (seguras por el lock de Prisma).
