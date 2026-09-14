# Servicio Whisper (auto-transcripción de vídeos subidos)

Transcribe los mp4/webm subidos a MinIO para el tutor IA (LMS-90.D). Los vídeos
de YouTube NO pasan por aquí (usan sus subtítulos, gratis y sin este servicio).

Implementa el contrato que espera el API (`whisper-transcriber.ts`):

```
POST /transcribe
Authorization: Bearer <clave>        (opcional)
{ "url": "<url firmada del vídeo>", "language": "es" }
→ 200 { "text": "..." }
```

## Despliegue en EasyPanel

El deploy tiene DOS partes. La 1 es la que habilita Whisper para mp4; la 2 es
imprescindible para que exista la feature (código nuevo) en producción.

### 1) Crear el servicio Whisper

1. En el proyecto de Didacta, **Create → App** (o Compose). Nombre: `didacta-whisper`.
2. **Source**: build desde este repo, ruta `deploy/whisper` (Dockerfile ahí), o
   sube estos 3 ficheros a un repo aparte. Es una imagen amd64 normal.
3. **Recursos**: CPU y RAM generosos (Whisper es intensivo). Mínimo ~2 vCPU / 4 GB
   para el modelo `small`. Sin GPU (corre en CPU con int8).
4. **Volumen**: monta uno en `/root/.cache/huggingface` para cachear los pesos
   del modelo entre deploys (si no, los baja cada arranque).
5. **Env** (opcionales):
   - `WHISPER_MODEL=small` (usa `base` si quieres más velocidad, `medium` más
     calidad y más lento).
   - `WHISPER_API_KEY=<una clave>` — si la pones, DEBE coincidir con
     `TRANSCRIPTION_WHISPER_KEY` del app de Didacta.
6. **Puerto interno**: 8000. No hace falta exponerlo a internet: el app de
   Didacta lo llama por la red interna del proyecto.
7. Deploy. Verifica: `GET http://didacta-whisper:8000/health` → `{"ok":true,...}`.

### 2) Desplegar el app de Didacta con el código nuevo

El pipeline de transcripción es código nuevo (commit `1d6a2b3`): producción no lo
tiene hasta reconstruir la imagen del app.

1. Construir la imagen **amd64** desde `didacta-io` y subirla a GHCR (mismo flujo
   de siempre; OJO: siempre `--platform linux/amd64`, arm64 crashea Prisma):
   ```bash
   docker build --platform linux/amd64 --build-arg DIDACTA_VERSION=0.1.0-beta.9 \
     -t ghcr.io/diegoforerog/didacta:beta9-dropi .
   docker push ghcr.io/diegoforerog/didacta:beta9-dropi
   ```
2. En el app de Didacta en EasyPanel, añade la env que apunta al servicio Whisper
   y (si la usaste) la clave:
   ```
   TRANSCRIPTION_WHISPER_URL=http://didacta-whisper:8000/transcribe
   TRANSCRIPTION_WHISPER_KEY=<la misma que WHISPER_API_KEY>   # solo si la pusiste
   TRANSCRIPTION_WHISPER_LANG=es
   ```
3. **Deploy + Restart** del app (Deploy solo no corta el proceso viejo).

### 3) Backfill de lo ya cargado

En `/admin/ia/providers`, sección **"Transcripción de vídeos existentes"** →
botón **"Transcribir todos los vídeos publicados"**. Recorre los vídeos sin
transcript: YouTube por subtítulos, mp4 por este Whisper. Cada uno reindexa la
lección en el tutor automáticamente.

> Si `TRANSCRIPTION_WHISPER_URL` NO está configurada, YouTube igual funciona; los
> mp4 subidos se saltan (se registra en el log) hasta que exista el servicio.
