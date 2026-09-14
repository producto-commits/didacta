/**
 * Copyright (c) VA360 LABS S.L.
 * SPDX-License-Identifier: LicenseRef-Didacta-Sustainable-Use
 */

import { Injectable, Logger, type OnModuleInit } from '@nestjs/common';
import { ModuleContextFactory } from '../module-context.factory';
import { TranscriptionService } from './transcription.service';

interface LessonEvent {
  lessonId: string;
}

/**
 * Auto-transcripción reactiva de lecciones VIDEO (LMS-90.D).
 *
 * Escucha `courses.lesson.created/updated` y delega en `TranscriptionService`
 * para rellenar `content.transcript` cuando falta, de modo que el tutor IA
 * tenga texto que indexar (antes el transcript se pegaba a mano y los vídeos sin
 * él quedaban invisibles: "esto no lo veo en el material del curso").
 *
 * El servicio escribe con `updateLesson`, que RE-EMITE `courses.lesson.updated`:
 *   1. El AiTutorBridge reindexa la lección YA con el transcript.
 *   2. Este bridge se re-dispara, el servicio ve el transcript lleno y lo salta
 *      → guardia natural contra el bucle infinito.
 *
 * Vive en el host (compone mod.courses + storage + IA). Best-effort: un fallo
 * aquí nunca tumba el guardado de la lección.
 */
@Injectable()
export class TranscriptionBridge implements OnModuleInit {
  private readonly logger = new Logger(TranscriptionBridge.name);

  constructor(
    private readonly factory: ModuleContextFactory,
    private readonly transcription: TranscriptionService,
  ) {}

  onModuleInit(): void {
    const bus = this.factory.getEventBus();
    const handler = (event: { metadata: { tenantId?: string }; data: LessonEvent }) =>
      this.onLessonSaved(event.metadata.tenantId, event.data.lessonId);
    bus.subscribe<LessonEvent>('courses.lesson.created', handler);
    bus.subscribe<LessonEvent>('courses.lesson.updated', handler);
    this.logger.log(
      `Auto-transcripción activa (YouTube gratis${this.transcription.whisperEnabled ? ' + Whisper para mp4' : '; Whisper mp4 OFF: falta TRANSCRIPTION_WHISPER_URL'}).`,
    );
  }

  private async onLessonSaved(tenantId: string | undefined, lessonId: string): Promise<void> {
    if (!tenantId) return;
    try {
      const outcome = await this.transcription.transcribeLesson(tenantId, lessonId);
      if (outcome.status === 'done') {
        this.logger.log(
          `Lección ${lessonId} (${outcome.kind}) transcrita: ${outcome.chars} chars.`,
        );
      }
    } catch (error) {
      // Un fallo de transcripción no puede tumbar el guardado de la lección.
      this.logger.warn(`Auto-transcripción falló para lección ${lessonId}: ${String(error)}`);
    }
  }
}
