/**
 * Copyright (c) VA360 LABS S.L.
 * SPDX-License-Identifier: LicenseRef-Didacta-Sustainable-Use
 */

import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
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
import { parseInbound, secretMatches } from './dana-protocol';
import { DanaService } from './dana.service';

const sendSchema = z.object({
  mensaje: z.string().trim().min(1).max(4000),
  /** Abre una conversación nueva aunque la última siga activa. */
  nuevaConversacion: z.boolean().optional(),
});
type SendDto = z.infer<typeof sendSchema>;

/** Chat del alumno con Dana (asistente de retos → "Hablar con Dana"). */
@ApiTags('Me · Dana')
@ApiBearerAuth()
@Controller('me/dana')
@UseGuards(JwtAuthGuard)
export class MeDanaController {
  constructor(private readonly dana: DanaService) {}

  private requireAuth(user: SessionClaims | undefined): SessionClaims {
    if (!user) throw new UnauthorizedException();
    return user;
  }

  @Get('status')
  @ApiOperation({ summary: '¿Está Dana configurada en este servidor?' })
  status() {
    return { enabled: this.dana.enabled };
  }

  @Get('conversations')
  @ApiOperation({ summary: 'Mis conversaciones con Dana, la más reciente primero.' })
  conversations(@CurrentUser() user: SessionClaims | undefined) {
    const u = this.requireAuth(user);
    return this.dana.conversations(u.tenantId, u.sub);
  }

  @Get('messages')
  @ApiOperation({
    summary:
      'Mis mensajes con Dana (opcionalmente de una conversación, o solo lo posterior a `since`).',
  })
  list(
    @CurrentUser() user: SessionClaims | undefined,
    @Query('since') since?: string,
    @Query('conversationId') conversationId?: string,
  ) {
    const u = this.requireAuth(user);
    return this.dana.list(u.tenantId, u.sub, {
      sinceIso: since?.trim() || undefined,
      conversationId: conversationId?.trim() || undefined,
    });
  }

  @Post('messages')
  @ApiOperation({
    summary: 'Envía un mensaje a Dana (n8n). Devuelve la respuesta si llega síncrona.',
  })
  send(
    @CurrentUser() user: SessionClaims | undefined,
    @Body(new ZodValidationPipe(sendSchema)) dto: SendDto,
  ) {
    const u = this.requireAuth(user);
    return this.dana.send(u.tenantId, u.sub, dto.mensaje, {
      newConversation: dto.nuevaConversacion === true,
    });
  }
}

/**
 * Webhook receptor para n8n: `POST /api/v1/webhooks/dana` con
 * `{ correo, mensaje }` y la cabecera `X-Dana-Secret` (= DANA_WEBHOOK_SECRET).
 * Público (sin JWT): lo protege el secreto compartido.
 */
@ApiTags('Webhooks')
@Controller('webhooks/dana')
export class DanaWebhookController {
  constructor(private readonly dana: DanaService) {}

  @Post()
  @HttpCode(200)
  @ApiOperation({ summary: 'Respuesta de Dana (n8n) para un alumno, casada por correo.' })
  async receive(
    @Body() body: unknown,
    @Headers('x-dana-secret') secretHeader?: string,
    @Headers('authorization') authorization?: string,
  ) {
    const provided = secretHeader ?? authorization?.replace(/^Bearer\s+/i, '');
    if (!secretMatches(this.dana.secret, provided)) {
      throw new UnauthorizedException({
        message: 'Secreto de Dana inválido.',
        code: 'DANA_BAD_SECRET',
      });
    }
    const msg = parseInbound(body);
    if (!msg) return { ok: false, error: 'Se esperan { correo, mensaje }' };
    return this.dana.receive(msg);
  }
}
