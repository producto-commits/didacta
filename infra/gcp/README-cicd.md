# CI/CD — quién despliega a qué

Objetivo: **el equipo despliega a staging; solo el core aprueba prod.**

- **Push a `main`** → GitHub Actions construye la imagen y la despliega a
  **staging** automáticamente (`.github/workflows/deploy-staging.yml`).
- **Prod** sale solo cuando el core lo aprueba: workflow **Deploy a producción**
  (`.github/workflows/deploy-prod.yml`), con un _Environment `production`_ que
  exige la aprobación de un reviewer antes de ejecutar. Promueve a prod la MISMA
  imagen ya verificada en staging (no reconstruye).

Auth a GCP es **sin llave** (Workload Identity Federation): no hay secreto que
se pueda filtrar.

## Setup (una sola vez)

### 1. GCP — WIF + SA de deploy

```bash
gcloud auth login
bash infra/gcp/setup-cicd-wif.sh
```

Al final imprime dos valores (`WIF_PROVIDER`, `DEPLOYER_SA`).

### 2. GitHub — Variables del repo

Settings → **Secrets and variables → Actions → Variables** → New variable:

| Nombre         | Valor (lo imprime el script)                                                                  |
| -------------- | --------------------------------------------------------------------------------------------- |
| `WIF_PROVIDER` | `projects/<num>/locations/global/workloadIdentityPools/github-pool/providers/github-provider` |
| `DEPLOYER_SA`  | `github-deployer@dropi-academy.iam.gserviceaccount.com`                                       |

### 3. GitHub — Environment `production` (el gate de prod)

Settings → **Environments** → New environment → `production`:

- Marca **Required reviewers** y agrega al core (ti). Sin esa aprobación, el
  deploy a prod no corre.
- (Opcional) **Deployment branches**: limita a `main`.

### 4. (Opcional) Proteger `main`

Settings → Branches → Branch protection rule para `main` (PR + review) si no
quieres pushes directos.

## Uso diario

- **El equipo:** hace push/merge a `main` → su cambio queda en **staging** solo.
- **Para subir a prod** (core): Actions → **Deploy a producción** → _Run
  workflow_ → `image_tag` = el `ci-<sha>` que salió en el resumen del deploy de
  staging → GitHub pide tu aprobación → se despliega.

> El `gcloud run services update ... --image=...` manual sigue funcionando como
> respaldo, pero el camino normal es por estos workflows.
