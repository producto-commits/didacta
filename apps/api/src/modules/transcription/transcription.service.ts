/**
 * Copyright (c) VA360 LABS S.L.
 * SPDX-License-Identifier: LicenseRef-Didacta-Sustainable-Use
 */

import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { ModuleContextFactory } from '../module-context.factory';
import { ModuleRegistryService } from '../module-registry.service';
import { detectVideoSource, type VideoSource } from './video-source';
import { fetchYoutubeTranscript } from './youtube-transcript';
import {
  transcribeStorageVideo,
  whisperConfigFromEnv,
  type WhisperConfig,
} from './whisper-transcriber';

export type TranscribeReason =
  | 'not-video'
  | 'already-has-transcript'
  | 'unknown-source'
  | 'whisper-not-configured'
  | 'no-captions';

export interface TranscribeOutcome {
  lessonId: string;
  status: 'done' | 'skipped';
  reason?: TranscribeReason;
  kind?: VideoSource['kind'];
  chars?: number;
}

export interface BackfillResult {
  total: number;
  transcribed: number;
  skipped: number;
  failed: number;
  results: Array<TranscribeOutcome & { error?: string }>;
}

/**
 * Núcleo de la auto-transcripción de lecciones VIDEO (LMS-90.D). Lo comparten:
 *   - `TranscriptionBridge` (reactivo: al crear/editar una lección).
 *   - El endpoint de backfill (`transcribe-all`) para los vídeos que YA estaban
 *     cargados antes de existir esta feature.
 *
 * Rellena `content.transcript` según el origen del vídeo (YouTube gratis /
 * Whisper para mp4 subido) y escribe vía `updateLesson`, que re-emite
 * `courses.lesson.updated` → el AiTutorBridge reindexa con el transcript ya
 * puesto. Idempotente: una lección que ya tiene transcript se salta.
 */
@Injectable()
export class TranscriptionService {
  private readonly logger = new Logger(TranscriptionService.name);
  private readonly whisper: WhisperConfig | null = whisperConfigFromEnv();

  constructor(
    private readonly prisma: PrismaService,
    private readonly factory: ModuleContextFactory,
    private readonly registry: ModuleRegistryService,
  ) {}

  get whisperEnabled(): boolean {
    return this.whisper !== null;
  }

  /**
   * Transcribe UNA lección si es VIDEO y aún no tiene transcript. Best-effort a
   * nivel de caller: aquí sí puede lanzar (el backfill lo captura por lección;
   * el bridge lo envuelve en try/catch).
   */
  async transcribeLesson(tenantId: string, lessonId: string): Promise<TranscribeOutcome> {
    const lesson = await this.prisma.modCoursesLesson.findFirst({
      where: { id: lessonId, tenantId, deletedAt: null },
      select: { id: true, type: true, content: true },
    });
    if (!lesson || lesson.type !== 'VIDEO') {
      return { lessonId, status: 'skipped', reason: 'not-video' };
    }
    const content = (lesson.content ?? {}) as Record<string, unknown>;
    const existing = content['transcript'];
    if (typeof existing === 'string' && existing.trim().length > 0) {
      return { lessonId, status: 'skipped', reason: 'already-has-transcript' };
    }

    const source = detectVideoSource(content['videoUrl']);
    const { transcript, reason } = await this.resolveTranscript(tenantId, source);
    if (!transcript) {
      return { lessonId, status: 'skipped', reason, kind: source.kind };
    }

    await this.registry.getCoursesService().updateLesson(tenantId, null, lessonId, {
      content: { ...content, transcript },
    });
    return { lessonId, status: 'done', kind: source.kind, chars: transcript.length };
  }

  /**
   * Transcribe TODOS los vídeos sin transcript de los cursos PUBLICADOS del
   * tenant (backfill). Secuencial a propósito: la transcripción es pesada
   * (bajar captions / correr Whisper) y no queremos saturar el servicio ni el
   * bus de reindexado.
   */
  async backfillPublished(tenantId: string): Promise<BackfillResult> {
    const lessons = await this.prisma.modCoursesLesson.findMany({
      where: {
        tenantId,
        type: 'VIDEO',
        deletedAt: null,
        module: { course: { status: 'PUBLISHED', deletedAt: null } },
      },
      select: { id: true },
    });
    const results: BackfillResult['results'] = [];
    for (const { id } of lessons) {
      try {
        results.push(await this.transcribeLesson(tenantId, id));
      } catch (err) {
        results.push({
          lessonId: id,
          status: 'skipped',
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }
    return {
      total: lessons.length,
      transcribed: results.filter((r) => r.status === 'done').length,
      skipped: results.filter((r) => r.status === 'skipped' && !r.error).length,
      failed: results.filter((r) => r.error).length,
      results,
    };
  }

  /** Enruta al transcriptor según el origen. Devuelve texto + motivo si vacío. */
  private async resolveTranscript(
    tenantId: string,
    source: VideoSource,
  ): Promise<{ transcript: string | null; reason?: TranscribeReason }> {
    if (source.kind === 'youtube') {
      const r = await fetchYoutubeTranscript(source.videoId);
      return r?.text ? { transcript: r.text } : { transcript: null, reason: 'no-captions' };
    }
    if (source.kind === 'storage') {
      if (!this.whisper) {
        this.logger.debug(`Vídeo subido (tenant ${tenantId}) sin transcribir: Whisper OFF.`);
        return { transcript: null, reason: 'whisper-not-configured' };
      }
      const signed = await this.factory.getStorage().getSignedUrl(source.key, 3600);
      const text = await transcribeStorageVideo(signed, this.whisper);
      return text ? { transcript: text } : { transcript: null, reason: 'no-captions' };
    }
    return { transcript: null, reason: 'unknown-source' };
  }
}
