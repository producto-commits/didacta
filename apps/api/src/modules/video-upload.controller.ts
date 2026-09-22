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

/** Tamaño de cada parte en la subida multipart (8 MiB). Mín. S3 = 5 MiB. */
const MULTIPART_PART_SIZE = 8 * 1024 * 1024;
/** Máx. de partes que admite S3/MinIO por objeto. */
const MULTIPART_MAX_PARTS = 10_000;

const multipartCreateSchema = presignSchema;
const multipartPartSchema = z.object({
  key: z.string().trim().min(1).max(512),
  uploadId: z.string().trim().min(1).max(512),
  partNumber: z.number().int().min(1).max(MULTIPART_MAX_PARTS),
});
const multipartFinishSchema = z.object({
  key: z.string().trim().min(1).max(512),
  uploadId: z.string().trim().min(1).max(512),
});

type MultipartCreateDto = z.infer<typeof multipartCreateSchema>;
type MultipartPartDto = z.infer<typeof multipartPartSchema>;
type MultipartFinishDto = z.infer<typeof multipartFinishSchema>;

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
  ): Promise<{ uploadUrl: string; key: string; playbackUrl: string; multipart: boolean }> {
    if (!user) throw new UnauthorizedException();
    if (!user.roles.some((r) => VIDEO_UPLOAD_ROLES.has(r))) {
      throw new ForbiddenException('No tienes permiso para subir vídeos.');
    }

    const storage = this.factory.getStorage();
    if (typeof storage.getUploadUrl !== 'function') {
      throw new BadRequestException({
        message:
          'La subida de vídeos requiere almacenamiento de objetos (S3/MinIO/GCS). Configura STORAGE_DRIVER y sus variables.',
        code: 'VIDEO_UPLOAD_REQUIRES_S3',
      });
    }

    const ext = VIDEO_MIME_TO_EXT[dto.contentType]!;
    // Key escopada por tenant; nombre aleatorio (no expone el nombre original).
    const key = `videos/${user.tenantId}/${randomUUID()}.${ext}`;
    const uploadUrl = await storage.getUploadUrl(key, dto.contentType, 3600);

    // `multipart`: el driver soporta subida por partes estilo S3 (MinIO/S3). GCS
    // no (usa PUT único), así el cliente sabe que NO debe trocear los grandes.
    const multipart = typeof storage.createMultipartUpload === 'function';
    return { uploadUrl, key, playbackUrl: `/api/v1/storage/video/${key}`, multipart };
  }

  @Post('multipart/create')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Inicia una subida multipart (por partes) de un vídeo grande.' })
  async multipartCreate(
    @CurrentUser() user: SessionClaims | undefined,
    @Body(new ZodValidationPipe(multipartCreateSchema)) dto: MultipartCreateDto,
  ): Promise<{
    key: string;
    uploadId: string;
    playbackUrl: string;
    partSize: number;
  }> {
    const author = this.requireAuthor(user);
    const storage = this.factory.getStorage();
    if (typeof storage.createMultipartUpload !== 'function') {
      throw new BadRequestException({
        message: 'La subida de vídeos requiere almacenamiento de objetos (S3/MinIO).',
        code: 'VIDEO_UPLOAD_REQUIRES_S3',
      });
    }
    const ext = VIDEO_MIME_TO_EXT[dto.contentType]!;
    const key = `videos/${author.tenantId}/${randomUUID()}.${ext}`;
    const { uploadId } = await storage.createMultipartUpload(key, dto.contentType);
    return {
      key,
      uploadId,
      playbackUrl: `/api/v1/storage/video/${key}`,
      partSize: MULTIPART_PART_SIZE,
    };
  }

  @Post('multipart/part-url')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Firma el PUT de una parte de la subida multipart.' })
  async multipartPartUrl(
    @CurrentUser() user: SessionClaims | undefined,
    @Body(new ZodValidationPipe(multipartPartSchema)) dto: MultipartPartDto,
  ): Promise<{ url: string }> {
    const author = this.requireAuthor(user);
    this.assertOwnKey(author, dto.key);
    const storage = this.factory.getStorage();
    if (typeof storage.getUploadPartUrl !== 'function') {
      throw new BadRequestException({ code: 'VIDEO_UPLOAD_REQUIRES_S3', message: 'S3 requerido.' });
    }
    const url = await storage.getUploadPartUrl(dto.key, dto.uploadId, dto.partNumber, 3600);
    return { url };
  }

  @Post('multipart/complete')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Cierra la subida multipart y deja el vídeo listo.' })
  async multipartComplete(
    @CurrentUser() user: SessionClaims | undefined,
    @Body(new ZodValidationPipe(multipartFinishSchema)) dto: MultipartFinishDto,
  ): Promise<{ playbackUrl: string }> {
    const author = this.requireAuthor(user);
    this.assertOwnKey(author, dto.key);
    const storage = this.factory.getStorage();
    if (typeof storage.completeMultipartUpload !== 'function') {
      throw new BadRequestException({ code: 'VIDEO_UPLOAD_REQUIRES_S3', message: 'S3 requerido.' });
    }
    await storage.completeMultipartUpload(dto.key, dto.uploadId);
    return { playbackUrl: `/api/v1/storage/video/${dto.key}` };
  }

  @Post('multipart/abort')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Cancela una subida multipart y descarta los trozos subidos.' })
  async multipartAbort(
    @CurrentUser() user: SessionClaims | undefined,
    @Body(new ZodValidationPipe(multipartFinishSchema)) dto: MultipartFinishDto,
  ): Promise<{ ok: true }> {
    const author = this.requireAuthor(user);
    this.assertOwnKey(author, dto.key);
    const storage = this.factory.getStorage();
    if (typeof storage.abortMultipartUpload === 'function') {
      await storage.abortMultipartUpload(dto.key, dto.uploadId);
    }
    return { ok: true };
  }

  /** Rol autorizado para subir vídeos, o excepción. */
  private requireAuthor(user: SessionClaims | undefined): SessionClaims {
    if (!user) throw new UnauthorizedException();
    if (!user.roles.some((r) => VIDEO_UPLOAD_ROLES.has(r))) {
      throw new ForbiddenException('No tienes permiso para subir vídeos.');
    }
    return user;
  }

  /**
   * La key de una subida en curso llega del cliente: hay que exigir que
   * pertenezca al prefijo del propio tenant, para que nadie toque (ni complete
   * ni aborte) la subida de otro.
   */
  private assertOwnKey(user: SessionClaims, key: string): void {
    if (!key.startsWith(`videos/${user.tenantId}/`) || key.includes('..')) {
      throw new ForbiddenException({
        message: 'La subida no pertenece a tu organización.',
        code: 'VIDEO_UPLOAD_KEY_FORBIDDEN',
      });
    }
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
