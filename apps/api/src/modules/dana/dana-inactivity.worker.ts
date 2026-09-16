/**
 * Copyright (c) VA360 LABS S.L.
 * SPDX-License-Identifier: LicenseRef-Didacta-Sustainable-Use
 */

import { Injectable, type OnApplicationBootstrap, type OnModuleDestroy } from '@nestjs/common';
import { Queue, Worker, type ConnectionOptions } from 'bullmq';
import IORedis, { type Redis } from 'ioredis';
import { Logger as PinoLogger } from 'nestjs-pino';
import { DanaService } from './dana.service';

const QUEUE_NAME = 'didacta.dana.inactivity';
// Cada 5 min por defecto. Configurable vía env.
const REPEAT_PATTERN = process.env['DANA_SWEEP_CRON'] ?? '*/5 * * * *';

/**
 * Worker BullMQ que cierra las conversaciones de Dana por inactividad. Cada
 * tick llama a `DanaService.sweepInactive()`, que por cada conversación reciente
 * decide si Dana pregunta "¿sigues ahí?" o si la cierra (ver `decideInactivityAction`).
 *
 * Sin `REDIS_URL`, en tests, o con Dana no configurada, el worker no arranca.
 * El barrido también se puede forzar con `runNow()` (para QA).
 */
@Injectable()
export class DanaInactivityWorker implements OnApplicationBootstrap, OnModuleDestroy {
  private queue?: Queue;
  private worker?: Worker;
  private connection?: Redis;
  private workerConnection?: Redis;

  constructor(
    private readonly dana: DanaService,
    private readonly logger: PinoLogger,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    const redisUrl = process.env['REDIS_URL'];
    if (!redisUrl) {
      this.logger.warn('REDIS_URL no seteada — barrido de inactividad de Dana no arranca');
      return;
    }
    if (process.env['NODE_ENV'] === 'test') return;
    if (!this.dana.enabled) return; // Dana sin configurar: nada que barrer

    this.connection = new IORedis(redisUrl, { maxRetriesPerRequest: null, enableReadyCheck: true });
    this.workerConnection = new IORedis(redisUrl, {
      maxRetriesPerRequest: null,
      enableReadyCheck: true,
    });
    const conn: ConnectionOptions = this.connection;

    this.queue = new Queue(QUEUE_NAME, {
      connection: conn,
      defaultJobOptions: {
        attempts: 1,
        removeOnComplete: { age: 24 * 3600, count: 50 },
        removeOnFail: { age: 7 * 24 * 3600, count: 50 },
      },
    });

    this.worker = new Worker(
      QUEUE_NAME,
      async () => {
        await this.dana.sweepInactive();
      },
      { connection: this.workerConnection, concurrency: 1 },
    );

    this.worker.on('failed', (job, err) => {
      this.logger.error({ jobId: job?.id, err: err.message }, 'dana-inactivity job falló');
    });

    // Repeatable idempotente (jobId estable): rebootear no duplica.
    await this.queue.add(
      'tick',
      {},
      { repeat: { pattern: REPEAT_PATTERN }, jobId: 'dana-inactivity' },
    );
    this.logger.log(`barrido de inactividad de Dana activo (cron='${REPEAT_PATTERN}')`);
  }

  /** Fuerza un barrido (QA). */
  async runNow(): Promise<{ nudged: number; closed: number }> {
    return this.dana.sweepInactive();
  }

  async onModuleDestroy(): Promise<void> {
    try {
      await this.worker?.close();
    } catch {
      /* noop */
    }
    try {
      await this.queue?.close();
    } catch {
      /* noop */
    }
    try {
      await this.connection?.quit();
    } catch {
      /* noop */
    }
    try {
      await this.workerConnection?.quit();
    } catch {
      /* noop */
    }
  }
}
