/**
 * Copyright (c) VA360 LABS S.L.
 * SPDX-License-Identifier: LicenseRef-Didacta-Sustainable-Use
 */

import { randomUUID } from 'node:crypto';
import {
  BadRequestException,
  Body,
  Controller,
  ForbiddenException,
  Get,
  NotFoundException,
  Param,
  Post,
  Res,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { FastifyReply } from 'fastify';
import { z } from 'zod';
import { CurrentUser } from '../auth/decorators';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { ZodValidationPipe } from '../auth/zod-validation.pipe';
import type { SessionClaims } from '../auth/token.service';
import { ModuleContextFactory } from './module-context.factory';

/** Solo quien crea contenido sube vídeos de clase (no alumnos). */
const VIDEO_UPLOAD_ROLES = new Set(['super_admin', 'tenant_admin', 'formador']);

/** MIME de vídeo admitidos → extensión con la que se guarda la key. */
const VIDEO_MIME_TO_EXT: Record<string, string> = {
  'video/mp4': 'mp4',
  'video/webm': 'webm',
};

/** Tope de subida directa (el objeto va a S3, no a la RAM de Node). */
const MAX_VIDEO_BYTES = 5 * 1024 * 1024 * 1024; // 5 GiB

const presignSchema = z.object({
  filename: z.string().trim().min(1).max(255),
  contentType: z.enum(['video/mp4', 'video/webm']),
  sizeBytes: z.number().int().positive().max(MAX_VIDEO_BYTES),
});

type PresignDto = z.infer<typeof presignSchema>;

/**
 * Subida NATIVA de vídeos de clase desde el computador del formador.
 *
 * Flujo (subida directa, sin pasar los bytes por la API):
 *   1. POST /storage/video/presign  → el backend firma un PUT temporal a
 *      S3/MinIO y devuelve { uploadUrl, key, playbackUrl }.
 *   2. El navegador hace PUT del mp4 directo a `uploadUrl` (con progreso).
 *   3. La lección guarda `playbackUrl` como `videoUrl`.
 *   4. GET /storage/video/<key> (público) redirige (302) a un GET pre-firmado
 *      fresco; el <video> reproduce con Range/seek nativo servido por S3.
 *
 * Requiere el driver de storage S3 (MinIO). Con disco local, `getUploadUrl` no
 * existe y el endpoint responde 400 pidiendo configurar S3.
 */
@ApiTags('Storage')
@Controller('storage/video')
export class VideoUploadController {
  constructor(private readonly factory: ModuleContextFactory) {}

  @Post('presign')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({
    summary: 'Firma una subida directa (PUT) de un vídeo de clase a S3/MinIO.',
  })
  async presign(
    @CurrentUser() user: SessionClaims | undefined,
    @Body(new ZodValidationPipe(presignSchema)) dto: PresignDto,
  ): Promise<{ uploadUrl: string; key: string; playbackUrl: string }> {
    if (!user) throw new UnauthorizedException();
    if (!user.roles.some((r) => VIDEO_UPLOAD_ROLES.has(r))) {
      throw new ForbiddenException('No tienes permiso para subir vídeos.');
    }

    const storage = this.factory.getStorage();
    if (typeof storage.getUploadUrl !== 'function') {
      throw new BadRequestException({
        message:
          'La subida de vídeos requiere almacenamiento de objetos (S3/MinIO). Configura STORAGE_DRIVER=s3 y las variables S3_*.',
        code: 'VIDEO_UPLOAD_REQUIRES_S3',
      });
    }

    const ext = VIDEO_MIME_TO_EXT[dto.contentType]!;
    // Key escopada por tenant; nombre aleatorio (no expone el nombre original).
    const key = `videos/${user.tenantId}/${randomUUID()}.${ext}`;
    const uploadUrl = await storage.getUploadUrl(key, dto.contentType, 3600);

    return { uploadUrl, key, playbackUrl: `/api/v1/storage/video/${key}` };
  }

  @Get('*')
  @ApiOperation({
    summary: 'Redirige (302) al vídeo pre-firmado en S3 para reproducirlo con seek.',
  })
  async stream(@Param('*') keyPath: string, @Res() reply: FastifyReply): Promise<void> {
    const storage = this.factory.getStorage();
    let signed: string;
    try {
      signed = await storage.getSignedUrl(keyPath, 3600);
    } catch {
      throw new NotFoundException({
        message: 'Vídeo no encontrado.',
        code: 'STORAGE_VIDEO_NOT_FOUND',
      });
    }
    reply.header('Location', signed).header('Cache-Control', 'no-store').code(302).send();
  }
}
