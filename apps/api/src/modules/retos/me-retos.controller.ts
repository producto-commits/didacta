/**
 * Copyright (c) VA360 LABS S.L.
 * SPDX-License-Identifier: LicenseRef-Didacta-Sustainable-Use
 */

import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import { CurrentUser } from '../../auth/decorators';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { ZodValidationPipe } from '../../auth/zod-validation.pipe';
import type { SessionClaims } from '../../auth/token.service';
import { RetosEngineService } from './retos-engine.service';

const actionDoneSchema = z.object({
  answer: z.string().trim().max(500).optional(),
});
type ActionDoneDto = z.infer<typeof actionDoneSchema>;

/**
 * API del alumno para los retos (docs/retos/plan-retos.md §3.4):
 *   GET  /me/retos                       → retos del módulo con mi progreso y % del módulo
 *   GET  /me/retos/by-lesson/:lessonId   → el reto de esa lección (página del reto)
 *   POST /me/retos/:id/video-complete    → el player reporta video al 100 %
 *   POST /me/retos/:id/actions/:key/done → acción hecha por el alumno (perfil, confirmar…)
 */
@ApiTags('Me · Retos')
@ApiBearerAuth()
@Controller('me/retos')
@UseGuards(JwtAuthGuard)
export class MeRetosController {
  constructor(private readonly engine: RetosEngineService) {}

  private requireAuth(user: SessionClaims | undefined): SessionClaims {
    if (!user) throw new UnauthorizedException();
    return user;
  }

  @Get()
  @ApiOperation({ summary: 'Mis retos del módulo con progreso por paso y % del módulo.' })
  list(@CurrentUser() user: SessionClaims | undefined, @Query('moduleKey') moduleKey?: string) {
    const u = this.requireAuth(user);
    return this.engine.listForUser(u.tenantId, u.sub, moduleKey?.trim() || 'bienvenido');
  }

  @Get('by-lesson/:lessonId')
  @ApiOperation({
    summary: 'El reto de una lección con mi progreso (null si la lección no es un reto).',
  })
  async byLesson(
    @CurrentUser() user: SessionClaims | undefined,
    @Param('lessonId') lessonId: string,
  ) {
    const u = this.requireAuth(user);
    return { reto: await this.engine.getForLesson(u.tenantId, u.sub, lessonId) };
  }

  @Post(':id/video-complete')
  @ApiOperation({ summary: 'Reporta que el video del reto llegó al 100 %.' })
  videoComplete(@CurrentUser() user: SessionClaims | undefined, @Param('id') id: string) {
    const u = this.requireAuth(user);
    return this.engine.markVideoComplete(u.tenantId, u.sub, id);
  }

  @Post(':id/actions/:actionKey/done')
  @ApiOperation({ summary: 'Marca una acción del reto como hecha (solo tipos auto-marcables).' })
  actionDone(
    @CurrentUser() user: SessionClaims | undefined,
    @Param('id') id: string,
    @Param('actionKey') actionKey: string,
    @Body(new ZodValidationPipe(actionDoneSchema)) dto: ActionDoneDto,
  ) {
    const u = this.requireAuth(user);
    return this.engine.markActionDone(u.tenantId, u.sub, id, actionKey, dto);
  }
}
