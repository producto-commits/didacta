/**
 * Copyright (c) VA360 LABS S.L.
 * SPDX-License-Identifier: LicenseRef-Didacta-Sustainable-Use
 */

import { Storage, type Bucket } from '@google-cloud/storage';
import type { StorageAdapter } from '@didacta/core-kernel';

export interface GcsStorageOptions {
  bucket: string;
  /** TTL por defecto para URLs firmadas (segundos). Default 900 = 15 min. */
  presignedTtlSeconds?: number;
}

/**
 * Adapter de storage sobre Google Cloud Storage, KEYLESS.
 *
 * Por qué GCS nativo (y no S3-por-interoperabilidad): la organización prohíbe
 * crear llaves de service account (`constraints/iam.disableServiceAccountKeyCreation`),
 * que es justo lo que necesitaría el modo S3 de GCS (claves HMAC). Aquí no hay
 * llaves: la SA de runtime de Cloud Run autentica por ADC y FIRMA las URLs V4
 * usando la IAM Credentials API (`signBlob`). Requisitos en GCP:
 *   - La SA de runtime con `roles/iam.serviceAccountTokenCreator` SOBRE SÍ MISMA
 *     (para poder llamar a signBlob).
 *   - API `iamcredentials.googleapis.com` habilitada.
 *   - CORS del bucket permitiendo GET/PUT/HEAD desde el origen web (el navegador
 *     sube/lee directo contra `storage.googleapis.com`).
 *
 * Igual que el adapter S3, el bucket es PRIVADO: el backend entrega URLs V4
 * temporales; el navegador sube/descarga directo pero solo dentro del TTL. La
 * subida de vídeo usa un PUT firmado ÚNICO (sin multipart estilo S3, que exige
 * XML MPU + HMAC): al ir directo a GCS no hay proxy que corte el PUT grande.
 */
export class GcsStorageService implements StorageAdapter {
  private readonly storage: Storage;
  private readonly bucket: Bucket;
  private readonly defaultTtl: number;

  constructor(opts: GcsStorageOptions) {
    this.storage = new Storage();
    this.bucket = this.storage.bucket(opts.bucket);
    this.defaultTtl = opts.presignedTtlSeconds ?? 900;
  }

  async upload(
    key: string,
    data: Buffer | Uint8Array,
    contentType?: string,
  ): Promise<{ key: string }> {
    const safe = this.sanitize(key);
    await this.bucket.file(safe).save(Buffer.isBuffer(data) ? data : Buffer.from(data), {
      resumable: false,
      ...(contentType ? { contentType } : {}),
    });
    return { key: safe };
  }

  async download(key: string): Promise<Buffer> {
    const safe = this.sanitize(key);
    const [buf] = await this.bucket.file(safe).download();
    return buf;
  }

  async delete(key: string): Promise<void> {
    const safe = this.sanitize(key);
    await this.bucket.file(safe).delete({ ignoreNotFound: true });
  }

  async getSignedUrl(key: string, expiresInSeconds?: number): Promise<string> {
    const safe = this.sanitize(key);
    const [url] = await this.bucket.file(safe).getSignedUrl({
      version: 'v4',
      action: 'read',
      expires: Date.now() + (expiresInSeconds ?? this.defaultTtl) * 1000,
    });
    return url;
  }

  /**
   * PUT firmado V4: el navegador sube el fichero DIRECTO a GCS. El `contentType`
   * se firma y el cliente debe mandar esa misma cabecera `Content-Type` (si no,
   * la firma no valida), y queda persistido en el objeto para servir el GET con
   * el MIME correcto y Range (seek de vídeo). No hay multipart: un solo PUT.
   */
  async getUploadUrl(key: string, contentType: string, expiresInSeconds?: number): Promise<string> {
    const safe = this.sanitize(key);
    const [url] = await this.bucket.file(safe).getSignedUrl({
      version: 'v4',
      action: 'write',
      contentType,
      expires: Date.now() + (expiresInSeconds ?? this.defaultTtl) * 1000,
    });
    return url;
  }

  /** Health check: ¿existe el bucket y tenemos acceso? */
  async ping(): Promise<boolean> {
    try {
      const [ok] = await this.bucket.exists();
      return ok;
    } catch {
      return false;
    }
  }

  async exists(key: string): Promise<boolean> {
    try {
      const [ok] = await this.bucket.file(this.sanitize(key)).exists();
      return ok;
    } catch {
      return false;
    }
  }

  private sanitize(key: string): string {
    if (!key || key.length > 1024) throw new Error('GCS key inválida');
    if (!/^[A-Za-z0-9._\-/]+$/.test(key)) {
      throw new Error('GCS key contiene caracteres no permitidos');
    }
    if (key.includes('..')) throw new Error('GCS key contiene traversal');
    if (key.startsWith('/')) throw new Error('GCS key no debe empezar con /');
    return key;
  }
}

/**
 * Construye un GcsStorageService desde el entorno. Bucket por `GCS_BUCKET` (o
 * `S3_BUCKET` como alias, para reusar el mismo nombre). Devuelve null si falta.
 */
export function buildGcsStorageFromEnv(env = process.env): GcsStorageService | null {
  const bucket = env['GCS_BUCKET'] ?? env['S3_BUCKET'];
  if (!bucket) return null;
  const presignedTtlSeconds = env['S3_PRESIGNED_TTL_SECONDS']
    ? Number(env['S3_PRESIGNED_TTL_SECONDS'])
    : undefined;
  return new GcsStorageService(
    presignedTtlSeconds !== undefined ? { bucket, presignedTtlSeconds } : { bucket },
  );
}
