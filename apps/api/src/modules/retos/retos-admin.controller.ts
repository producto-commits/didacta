/**
 * Copyright (c) VA360 LABS S.L.
 * SPDX-License-Identifier: LicenseRef-Didacta-Sustainable-Use
 */

import {
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  Param,
  Post,
  Put,
  Query,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../auth/decorators';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { ZodValidationPipe } from '../../auth/zod-validation.pipe';
import type { SessionClaims } from '../../auth/token.service';
import { listActionTypes } from './action-catalog';
import {
  createActionSchema,
  createRetoSchema,
  reorderActionsSchema,
  updateActionSchema,
  updateRetoSchema,
  type CreateActionDto,
  type CreateRetoDto,
  type ReorderActionsDto,
  type UpdateActionDto,
  type UpdateRetoDto,
} from './dto';
import { RetosService } from './retos.service';
import { bienvenidoSeed } from './seeds/bienvenido';

const ADMIN_ROLES = new Set(['super_admin', 'tenant_admin']);

/**
 * Admin de Retos (docs/retos/plan-retos.md §3.7): definir retos, asociarles
 * lección + quiz + acciones del catálogo, e importar el seed del módulo
 * Bienvenido. Solo admins.
 */
@ApiTags('Admin · Retos')
@ApiBearerAuth()
@Controller('admin/retos')
@UseGuards(JwtAuthGuard)
export class RetosAdminController {
  constructor(private readonly retos: RetosService) {}

  private requireAdmin(user: SessionClaims | undefined): SessionClaims {
    if (!user) throw new UnauthorizedException();
    if (!user.roles.some((r) => ADMIN_ROLES.has(r))) {
      throw new ForbiddenException({
        message: 'Solo admins pueden gestionar retos.',
        code: 'RETOS_ADMIN_REQUIRED',
      });
    }
    return user;
  }

  @Get('catalog')
  @ApiOperation({ summary: 'Catálogo de tipos de acción disponibles para armar un reto.' })
  catalog(@CurrentUser() user: SessionClaims | undefined) {
    this.requireAdmin(user);
    return { types: listActionTypes() };
  }

  @Get()
  @ApiOperation({
    summary: 'Lista los retos del tenant (con sus acciones), por módulo y posición.',
  })
  list(@CurrentUser() user: SessionClaims | undefined, @Query('moduleKey') moduleKey?: string) {
    const u = this.requireAdmin(user);
    return this.retos.listRetos(u.tenantId, moduleKey?.trim() || undefined);
  }

  @Post()
  @ApiOperation({ summary: 'Crea un reto.' })
  create(
    @CurrentUser() user: SessionClaims | undefined,
    @Body(new ZodValidationPipe(createRetoSchema)) dto: CreateRetoDto,
  ) {
    const u = this.requireAdmin(user);
    return this.retos.createReto(u.tenantId, dto);
  }

  @Post('import/bienvenido')
  @ApiOperation({
    summary:
      'Importa (crea o actualiza) los 5 retos del módulo Bienvenido con sus quizzes y acciones. Idempotente por clave.',
  })
  importBienvenido(@CurrentUser() user: SessionClaims | undefined) {
    const u = this.requireAdmin(user);
    return this.retos.importSeed(u.tenantId, u.sub, bienvenidoSeed);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Detalle de un reto con sus acciones.' })
  get(@CurrentUser() user: SessionClaims | undefined, @Param('id') id: string) {
    const u = this.requireAdmin(user);
    return this.retos.getReto(u.tenantId, id);
  }

  @Put(':id')
  @ApiOperation({ summary: 'Actualiza un reto.' })
  update(
    @CurrentUser() user: SessionClaims | undefined,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(updateRetoSchema)) dto: UpdateRetoDto,
  ) {
    const u = this.requireAdmin(user);
    return this.retos.updateReto(u.tenantId, id, dto);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Elimina un reto y sus acciones.' })
  async remove(@CurrentUser() user: SessionClaims | undefined, @Param('id') id: string) {
    const u = this.requireAdmin(user);
    await this.retos.deleteReto(u.tenantId, id);
    return { ok: true };
  }

  @Post(':id/actions')
  @ApiOperation({ summary: 'Añade una acción del catálogo al reto.' })
  addAction(
    @CurrentUser() user: SessionClaims | undefined,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(createActionSchema)) dto: CreateActionDto,
  ) {
    const u = this.requireAdmin(user);
    return this.retos.addAction(u.tenantId, id, dto);
  }

  @Put(':id/actions/reorder')
  @ApiOperation({ summary: 'Reordena las acciones del reto.' })
  reorder(
    @CurrentUser() user: SessionClaims | undefined,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(reorderActionsSchema)) dto: ReorderActionsDto,
  ) {
    const u = this.requireAdmin(user);
    return this.retos.reorderActions(u.tenantId, id, dto.actionIds);
  }

  @Put(':id/actions/:actionId')
  @ApiOperation({ summary: 'Actualiza una acción del reto (revalida su config).' })
  updateAction(
    @CurrentUser() user: SessionClaims | undefined,
    @Param('id') id: string,
    @Param('actionId') actionId: string,
    @Body(new ZodValidationPipe(updateActionSchema)) dto: UpdateActionDto,
  ) {
    const u = this.requireAdmin(user);
    return this.retos.updateAction(u.tenantId, id, actionId, dto);
  }

  @Delete(':id/actions/:actionId')
  @ApiOperation({ summary: 'Elimina una acción del reto.' })
  async removeAction(
    @CurrentUser() user: SessionClaims | undefined,
    @Param('id') id: string,
    @Param('actionId') actionId: string,
  ) {
    const u = this.requireAdmin(user);
    await this.retos.deleteAction(u.tenantId, id, actionId);
    return { ok: true };
  }
}
