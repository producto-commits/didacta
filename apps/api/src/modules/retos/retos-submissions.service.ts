/**
 * Copyright (c) VA360 LABS S.L.
 * SPDX-License-Identifier: LicenseRef-Didacta-Sustainable-Use
 */

import { randomUUID } from 'node:crypto';
import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { AiGatewayService } from '../../ai/ai-gateway.service';
import { PrismaService } from '../../prisma/prisma.service';
import { ModuleContextFactory } from '../module-context.factory';
import { requiredSubmissions, type AiAnalyzeImageConfig } from './action-catalog';
import {
  buildUserInstruction,
  IMAGE_MIME_EXT,
  MAX_IMAGE_BYTES,
  parseVerdict,
  toDataUrl,
  VERDICT_SYSTEM_PROMPT,
} from './reto-ai-validator';
import { RetosEngineService } from './retos-engine.service';

export interface SubmitImageResult {
  valid: boolean;
  /** Lo que ve el alumno: recomendaciones (analysis) o el mensaje fijo (fixed). */
  feedback: string;
  /** Canal detectado por la IA (publicaciones). */
  canal: string | null;
  /** Entregas aprobadas / necesarias tras esta (p.ej. 1/2). */
  count: number;
  needed: number;
  actionDone: boolean;
  retoCompleted: boolean;
  retoJustCompleted: boolean;
}

/**
 * Entregas de capturas para acciones `AI_ANALYZE_IMAGE` ("Reportar un reto",
 * docs/retos/plan-retos.md §3.5). Una entrega:
 *   1. se guarda en el storage como evidencia (mejor esfuerzo),
 *   2. la valida la IA de visión con el prompt de la acción → veredicto JSON,
 *   3. si es válida, el motor la registra (cuenta "1 de 2", puede cerrar el
 *      reto y otorgar la insignia de perfil ⚡ si la acción la concede).
 * Si NO es válida, no se registra nada y el alumno recibe el motivo.
 */
@Injectable()
export class RetosSubmissionsService {
  private readonly logger = new Logger(RetosSubmissionsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly factory: ModuleContextFactory,
    private readonly gateway: AiGatewayService,
    private readonly engine: RetosEngineService,
  ) {}

  async submitImage(
    tenantId: string,
    userId: string,
    retoId: string,
    actionKey: string,
    input: { imageBase64: string; mimeType: string },
  ): Promise<SubmitImageResult> {
    const ext = IMAGE_MIME_EXT[input.mimeType];
    if (!ext) {
      throw new BadRequestException({
        message: 'Formato no admitido. Sube una imagen JPG, PNG o WebP.',
        code: 'RETO_IMAGE_TYPE',
      });
    }
    const bytes = Buffer.from(input.imageBase64.replace(/^data:[^,]+,/, ''), 'base64');
    if (bytes.length === 0 || bytes.length > MAX_IMAGE_BYTES) {
      throw new BadRequestException({
        message: 'La imagen está vacía o supera los 6 MB.',
        code: 'RETO_IMAGE_SIZE',
      });
    }

    const reto = await this.prisma.modRetosReto.findFirst({
      where: { tenantId, id: retoId, status: 'PUBLISHED' },
      include: { actions: true },
    });
    const action = reto?.actions.find((a) => a.key === actionKey);
    if (!reto || !action || action.type !== 'AI_ANALYZE_IMAGE') {
      throw new NotFoundException({
        message: 'Acción no encontrada.',
        code: 'RETO_ACTION_NOT_FOUND',
      });
    }
    const cfg = action.config as AiAnalyzeImageConfig;
    const needed = requiredSubmissions('AI_ANALYZE_IMAGE', cfg as Record<string, unknown>);
    const doneRow = await this.prisma.modRetosActionDone.findUnique({
      where: { tenantId_userId_retoId_actionKey: { tenantId, userId, retoId, actionKey } },
    });
    const count = doneRow?.count ?? 0;
    if (count >= needed) {
      throw new BadRequestException({
        message: 'Esta acción ya está completa.',
        code: 'RETO_ACTION_ALREADY_DONE',
      });
    }

    // 1) Evidencia en el storage (mejor esfuerzo: un fallo no bloquea la validación).
    let storageKey: string | null = null;
    try {
      const key = `retos/${tenantId}/${userId}/${retoId}/${actionKey}-${count + 1}-${randomUUID()}.${ext}`;
      const up = await this.factory.getStorage().upload(key, bytes, input.mimeType);
      storageKey = up.key;
    } catch (err) {
      this.logger.warn(`No se pudo guardar la evidencia de ${actionKey}: ${String(err)}`);
    }

    // 2) Veredicto de la IA de visión.
    const chat = await this.gateway.chat({
      tenantId,
      input: {
        system: VERDICT_SYSTEM_PROMPT,
        messages: [
          {
            role: 'user',
            content: buildUserInstruction(cfg),
            images: [{ dataUrl: toDataUrl(input.mimeType, bytes) }],
          },
        ],
        temperature: 0.2,
        maxTokens: 500,
      },
    });
    const verdict = parseVerdict(chat.content);
    if (!verdict) {
      this.logger.warn(
        `Veredicto ilegible de la IA para ${actionKey}: ${chat.content.slice(0, 200)}`,
      );
    }
    const valid = verdict?.valido === true;

    if (!valid) {
      return {
        valid: false,
        feedback:
          verdict?.feedback ||
          'No pudimos validar esta captura. Revisa los pasos y sube una imagen que muestre claramente lo que pide la acción.',
        canal: verdict?.canal ?? null,
        count,
        needed,
        actionDone: false,
        retoCompleted: false,
        retoJustCompleted: false,
      };
    }

    // 3) Entrega aprobada → el motor cuenta, recalcula y premia si toca.
    const result = await this.engine.recordApprovedSubmission(tenantId, userId, retoId, actionKey, {
      storageKey,
      canal: verdict.canal,
      feedback: verdict.feedback,
      at: new Date().toISOString(),
      submission: count + 1,
    });
    const step = result.progress.steps.find((s) => s.key === actionKey);
    return {
      valid: true,
      feedback:
        cfg.feedbackMode === 'fixed' && cfg.fixedMessage ? cfg.fixedMessage : verdict.feedback,
      canal: verdict.canal,
      count: step?.count ?? count + 1,
      needed,
      actionDone: step?.done ?? false,
      retoCompleted: result.completed,
      retoJustCompleted: result.justCompleted,
    };
  }
}
