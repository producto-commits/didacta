/**
 * Copyright (c) VA360 LABS S.L.
 * SPDX-License-Identifier: LicenseRef-Didacta-Sustainable-Use
 */

import { Injectable, Logger, type OnModuleInit } from '@nestjs/common';
import { ModuleContextFactory } from '../module-context.factory';
import { RetosEngineService } from './retos-engine.service';

interface AttemptPassedPayload {
  attemptId: string;
  quizId: string;
  userId: string;
}

/**
 * Alimenta al motor de retos con los eventos que ya circulan por el bus:
 * un quiz aprobado que pertenece a un reto = paso "quiz" hecho.
 * (El video lo reporta el player por API; las acciones, sus validadores.)
 */
@Injectable()
export class RetosEventsBridge implements OnModuleInit {
  private readonly logger = new Logger(RetosEventsBridge.name);

  constructor(
    private readonly factory: ModuleContextFactory,
    private readonly engine: RetosEngineService,
  ) {}

  onModuleInit(): void {
    this.factory
      .getEventBus()
      .subscribe<AttemptPassedPayload>('assessments.attempt.passed', async (event) => {
        const tenantId = event.metadata.tenantId;
        if (!tenantId) return;
        try {
          const r = await this.engine.onQuizPassed(tenantId, event.data.userId, event.data.quizId);
          if (r?.justCompleted) {
            this.logger.log(`Quiz ${event.data.quizId} cerró un reto para ${event.data.userId}.`);
          }
        } catch (err) {
          // Best-effort: el intento ya está aprobado; el reto se recalcula en la
          // próxima interacción.
          this.logger.warn(`Retos: fallo procesando quiz aprobado: ${String(err)}`);
        }
      });
    this.logger.log('Motor de retos suscrito a assessments.attempt.passed');
  }
}
