# Copyright (c) VA360 LABS S.L.
# SPDX-License-Identifier: LicenseRef-Didacta-Sustainable-Use
#
# Servicio Whisper autoalojado para la auto-transcripción de Didacta (LMS-90.D).
#
# Implementa EXACTAMENTE el contrato que espera `whisper-transcriber.ts` del API:
#
#     POST /transcribe
#     Authorization: Bearer <TRANSCRIPTION_WHISPER_KEY>   (opcional)
#     Content-Type: application/json
#     body: { "url": "<url firmada del mp4/webm>", "language": "es" }
#
#     200 -> { "text": "transcripción..." }
#
# El API le manda la URL FIRMADA del objeto (no los bytes): este servicio baja el
# vídeo, faster-whisper extrae el audio con ffmpeg/PyAV y transcribe. Así la RAM
# del API nunca carga vídeos de varios GB — el trabajo pesado vive aquí.
#
# faster-whisper corre en CPU con cuantización int8: sin coste por minuto (GRATIS,
# solo consume el CPU de la VPS). Modelo por defecto `small` (buen equilibrio
# es/velocidad); configurable por env.

import os
import tempfile

import requests
from fastapi import FastAPI, Header, HTTPException
from faster_whisper import WhisperModel
from pydantic import BaseModel

MODEL_SIZE = os.environ.get("WHISPER_MODEL", "small")
DEVICE = os.environ.get("WHISPER_DEVICE", "cpu")
COMPUTE_TYPE = os.environ.get("WHISPER_COMPUTE_TYPE", "int8")
# Debe coincidir con TRANSCRIPTION_WHISPER_KEY del API. Vacío = sin auth.
API_KEY = os.environ.get("WHISPER_API_KEY", "").strip()
# Tope de descarga (bytes) para no llenar el disco con un vídeo gigante.
MAX_BYTES = int(os.environ.get("WHISPER_MAX_BYTES", str(5 * 1024 * 1024 * 1024)))

app = FastAPI(title="Didacta Whisper", version="1.0")

# Se carga una vez al arrancar (la primera vez descarga los pesos del modelo).
model = WhisperModel(MODEL_SIZE, device=DEVICE, compute_type=COMPUTE_TYPE)


class TranscribeIn(BaseModel):
    url: str
    language: str | None = "es"


@app.get("/health")
def health() -> dict:
    return {"ok": True, "model": MODEL_SIZE, "device": DEVICE}


@app.post("/transcribe")
def transcribe(body: TranscribeIn, authorization: str | None = Header(default=None)) -> dict:
    if API_KEY:
        expected = f"Bearer {API_KEY}"
        if authorization != expected:
            raise HTTPException(status_code=401, detail="unauthorized")

    if not body.url:
        raise HTTPException(status_code=400, detail="url requerida")

    # Bajar el objeto a un fichero temporal (streaming, sin cargarlo en RAM).
    suffix = ".mp4"
    with tempfile.NamedTemporaryFile(suffix=suffix, delete=True) as tmp:
        try:
            with requests.get(body.url, stream=True, timeout=120) as r:
                r.raise_for_status()
                total = 0
                for chunk in r.iter_content(chunk_size=1024 * 1024):
                    if not chunk:
                        continue
                    total += len(chunk)
                    if total > MAX_BYTES:
                        raise HTTPException(status_code=413, detail="vídeo demasiado grande")
                    tmp.write(chunk)
                tmp.flush()
        except HTTPException:
            raise
        except Exception as exc:  # noqa: BLE001
            raise HTTPException(status_code=502, detail=f"no se pudo bajar el vídeo: {exc}")

        # Transcribir. faster-whisper decodifica el mp4/webm con PyAV (ffmpeg).
        try:
            segments, _info = model.transcribe(
                tmp.name,
                language=(body.language or None),
                vad_filter=True,  # descarta silencios largos → más rápido y limpio
            )
            text = " ".join(seg.text.strip() for seg in segments).strip()
        except Exception as exc:  # noqa: BLE001
            raise HTTPException(status_code=500, detail=f"fallo transcribiendo: {exc}")

    return {"text": text}
