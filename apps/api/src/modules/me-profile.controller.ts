/**
 * Copyright (c) VA360 LABS S.L.
 * SPDX-License-Identifier: LicenseRef-Didacta-Sustainable-Use
 */

import {
  Body,
  Controller,
  Get,
  Param,
  Put,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import { CurrentUser, MfaExempt } from '../auth/decorators';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import type { SessionClaims } from '../auth/token.service';
import { ZodValidationPipe } from '../auth/zod-validation.pipe';
import { PrismaService } from '../prisma/prisma.service';

const keyParam = z
  .string()
  .min(1)
  .max(64)
  .regex(/^[a-z0-9-]+$/, 'clave inválida');
const saveSchema = z.object({ value: z.string().min(1).max(500) });

/**
 * Respuestas del miembro a las "preguntas de perfil" (single-choice que no
 * puntúan ni bloquean; se capturan para personalización futura — p.ej. la del
 * Reto 1). Cada pregunta se declara en el `content.profileQuestion` de una
 * lección; el player la muestra y guarda aquí la respuesta del alumno.
 */
@ApiTags('Me')
@ApiBearerAuth()
@Controller('me/profile-answers')
@UseGuards(JwtAuthGuard)
export class MeProfileController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  @MfaExempt()
  @ApiOperation({ summary: 'Respuestas de perfil del miembro que consulta.' })
  async list(
    @CurrentUser() user: SessionClaims | undefined,
  ): Promise<{ answers: { questionKey: string; value: string }[] }> {
    if (!user) throw new UnauthorizedException();
    const rows = await this.prisma.modProfileAnswer.findMany({
      where: { tenantId: user.tenantId, userId: user.sub },
      select: { questionKey: true, value: true },
    });
    return { answers: rows };
  }

  @Put(':key')
  @MfaExempt()
  @ApiOperation({ summary: 'Guarda (o actualiza) la respuesta de perfil del miembro.' })
  async save(
    @CurrentUser() user: SessionClaims | undefined,
    @Param('key') keyRaw: string,
    @Body(new ZodValidationPipe(saveSchema)) body: z.infer<typeof saveSchema>,
  ): Promise<{ ok: true }> {
    if (!user) throw new UnauthorizedException();
    const questionKey = keyParam.parse(keyRaw);
    await this.prisma.modProfileAnswer.upsert({
      where: {
        tenantId_userId_questionKey: { tenantId: user.tenantId, userId: user.sub, questionKey },
      },
      update: { value: body.value },
      create: { tenantId: user.tenantId, userId: user.sub, questionKey, value: body.value },
    });
    return { ok: true };
  }
}
