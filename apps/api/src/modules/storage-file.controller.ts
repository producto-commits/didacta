/**
 * Copyright (c) VA360 LABS S.L.
 * SPDX-License-Identifier: LicenseRef-Didacta-Sustainable-Use
 */

import { Controller, Get, NotFoundException, Param, Res } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import type { FastifyReply } from 'fastify';
import type { StorageService } from '@didacta/core-kernel';
import { ModuleContextFactory } from './module-context.factory';

const MIME_BY_EXT: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  webp: 'image/webp',
  gif: 'image/gif',
  svg: 'image/svg+xml',
  pdf: 'application/pdf',
};

/**
 * Sirve los objetos del storage por su KEY estable, de forma pública, para que
 * carguen en `<img src>` y como enlaces de descarga (los navegadores no envían
 * el bearer en imágenes). Es la ruta que se persiste — nunca una URL
 * pre-firmada, que caducaría.
 *
 * Resuelve el adapter que aplica al objeto (por tenant, si la key es
 * `tenants/<id>/…`) y sirve según el driver:
 *   - S3/MinIO  → 302 a un GET pre-firmado FRESCO (no-store), como el vídeo.
 *   - Disco local → streaming de los bytes.
 *
 * La key se sanea en el adapter (sin traversal, dentro del bucket/root). El CSP
 * `sandbox` en el streaming local mata el XSS almacenado same-origin (un SVG con
 * <script> abierto como página no ejecuta JS); en el 302 no aplica porque los
 * bytes los sirve S3 en otro origen.
 *
 * Ruta: `GET /api/v1/storage/file/<key>` (público, sin guard).
 */
@ApiTags('Storage')
@Controller('storage/file')
export class StorageFileController {
  constructor(private readonly factory: ModuleContextFactory) {}

  @Get('*')
  @ApiOperation({ summary: 'Sirve un objeto del storage por su key estable (público).' })
  async serve(@Param('*') keyPath: string, @Res() reply: FastifyReply): Promise<void> {
    const storage = await this.resolveStorage(keyPath);

    // El driver S3 implementa `getUploadUrl`; el disco local no. Con S3
    // redirigimos a una URL firmada fresca en cada lectura; con disco servimos
    // los bytes directamente (firmar ahí devolvería esta misma ruta → bucle).
    if (typeof storage.getUploadUrl === 'function') {
      let signed: string;
      try {
        signed = await storage.getSignedUrl(keyPath, 3600);
      } catch {
        throw new NotFoundException({
          message: 'Fichero no encontrado.',
          code: 'STORAGE_FILE_NOT_FOUND',
        });
      }
      reply.header('Location', signed).header('Cache-Control', 'no-store').code(302).send();
      return;
    }

    let buffer: Buffer;
    try {
      buffer = await storage.download(keyPath);
    } catch {
      throw new NotFoundException({
        message: 'Fichero no encontrado.',
        code: 'STORAGE_FILE_NOT_FOUND',
      });
    }
    const ext = keyPath.split('.').pop()?.toLowerCase() ?? '';
    const type = MIME_BY_EXT[ext] ?? 'application/octet-stream';
    reply
      .header('Content-Type', type)
      .header('Content-Security-Policy', 'sandbox')
      .header('X-Content-Type-Options', 'nosniff')
      .header('Content-Disposition', 'inline')
      .send(buffer);
  }

  /** Adapter del tenant si la key es `tenants/<id>/…`; si no, el global. */
  private async resolveStorage(keyPath: string): Promise<StorageService> {
    const m = /^tenants\/([^/]+)\//.exec(keyPath);
    if (m) return this.factory.getStorageForTenant(m[1]!);
    return this.factory.getStorage();
  }
}
