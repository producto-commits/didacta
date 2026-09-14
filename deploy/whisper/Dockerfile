# Copyright (c) VA360 LABS S.L.
# SPDX-License-Identifier: LicenseRef-Didacta-Sustainable-Use
#
# Servicio Whisper autoalojado para la auto-transcripción de Didacta.
# Imagen amd64 (la VPS es amd64). ffmpeg lo necesita faster-whisper/PyAV para
# decodificar el mp4/webm.

FROM python:3.11-slim

RUN apt-get update \
  && apt-get install -y --no-install-recommends ffmpeg \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

COPY main.py ./

# El modelo se descarga en el primer arranque; se cachea en este volumen para no
# volver a bajarlo en cada deploy (montar un volumen en /root/.cache).
ENV HF_HOME=/root/.cache/huggingface

EXPOSE 8000

CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
