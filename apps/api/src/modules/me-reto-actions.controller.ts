/**
 * Copyright (c) VA360 LABS S.L.
 * SPDX-License-Identifier: LicenseRef-Didacta-Sustainable-Use
 */

import { Controller, Get, Param, Put, UnauthorizedException, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import { CurrentUser, MfaExempt } from '../auth/decorators';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import type { SessionClaims } from '../auth/token.service';
import { PrismaService } from '../prisma/prisma.service';

const uuid = z.string().uuid();
const actionKey = z
  .string()
  .min(1)
  .max(64)
  .regex(/^[a-z0-9-]+$/, 'clave inválida');

/**
 * Acciones EXTRA de un reto que el alumno ya completó (más allá del vídeo/quiz)
 * — hoy la "acción con IA" (hablar con Danna). El player retiene la
 * finalización del reto hasta que todas sus acciones extra estén marcadas aquí.
 */
@ApiTags('Me')
@ApiBearerAuth()
@Controller('me/reto-actions')
@UseGuards(JwtAuthGuard)
export class MeRetoActionsController {
  constructor(private readonly prisma: PrismaService) {}

  @Get(':lessonId')
  @MfaExempt()
  @ApiOperation({ summary: 'Acciones de reto completadas por el miembro en una lección.' })
  async list(
    @CurrentUser() user: SessionClaims | undefined,
    @Param('lessonId') lessonIdRaw: string,
  ): Promise<{ done: string[] }> {
    if (!user) throw new UnauthorizedException();
    const lessonId = uuid.parse(lessonIdRaw);
    const rows = await this.prisma.modRetoActionDone.findMany({
      where: { tenantId: user.tenantId, userId: user.sub, lessonId },
      select: { actionKey: true },
    });
    return { done: rows.map((r) => r.actionKey) };
  }

  @Put(':lessonId/:actionKey')
  @MfaExempt()
  @ApiOperation({ summary: 'Marca una acción de reto como completada (idempotente).' })
  async markDone(
    @CurrentUser() user: SessionClaims | undefined,
    @Param('lessonId') lessonIdRaw: string,
    @Param('actionKey') actionKeyRaw: string,
  ): Promise<{ ok: true }> {
    if (!user) throw new UnauthorizedException();
    const lessonId = uuid.parse(lessonIdRaw);
    const key = actionKey.parse(actionKeyRaw);
    await this.prisma.modRetoActionDone.upsert({
      where: {
        tenantId_userId_lessonId_actionKey: {
          tenantId: user.tenantId,
          userId: user.sub,
          lessonId,
          actionKey: key,
        },
      },
      update: {},
      create: { tenantId: user.tenantId, userId: user.sub, lessonId, actionKey: key },
    });
    return { ok: true };
  }
}
