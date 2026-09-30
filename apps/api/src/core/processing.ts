import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../common/audit.service';
import { NumberingService } from '../common/numbering.service';
import { RequirePermissions, CurrentUser, type AuthUser } from '../common/decorators';
import { ZodValidationPipe } from '../common/zod.pipe';
import { processingBatchSchema, type ProcessingBatchInput, formatLotId } from '@madda/shared';

@Controller('processing')
export class ProcessingController {
  constructor(private prisma: PrismaService, private audit: AuditService, private numbering: NumberingService) {}

  @Get()
  @RequirePermissions('processing.read')
  list(@Query('stationId') stationId?: string) {
    return this.prisma.processingBatch.findMany({
      where: stationId ? { stationId } : {},
      include: { station: true, lot: true },
      orderBy: { date: 'desc' },
      take: 500,
    });
  }

  @Post()
  @RequirePermissions('processing.write')
  async create(@Body(new ZodValidationPipe(processingBatchSchema)) body: ProcessingBatchInput, @CurrentUser() actor: AuthUser) {
    const code = await this.numbering.next('batch', body.date);
    let lotId = body.lotId || null;
    if (!lotId) {
      const station = await this.prisma.station.findUnique({ where: { id: body.stationId } });
      const count = await this.prisma.lot.count({
        where: { stationId: body.stationId, process: body.process },
      });
      lotId = formatLotId(station?.code ?? 'ST', body.process, count + 1);
    }
    await this.prisma.lot.upsert({
      where: { lotId },
      create: {
        lotId,
        stationId: body.stationId,
        process: body.process,
        grade: body.grade ?? null,
        screenSize: body.screenSize ?? null,
        cuppingScore: body.cuppingScore ?? null,
        status: 'Active',
      },
      update: { grade: body.grade ?? undefined, cuppingScore: body.cuppingScore ?? undefined },
    });

    const batch = await this.prisma.processingBatch.create({
      data: {
        code,
        date: body.date,
        stationId: body.stationId,
        lotId,
        process: body.process,
        cherryInputKg: body.cherryInputKg,
        parchmentOutputKg: body.parchmentOutputKg ?? null,
        dryParchmentKg: body.dryParchmentKg ?? null,
        greenOutputKg: body.greenOutputKg ?? null,
        moisturePct: body.moisturePct ?? null,
        grade: body.grade ?? null,
        screenSize: body.screenSize ?? null,
        cuppingScore: body.cuppingScore ?? null,
        status: body.status,
        notes: body.notes ?? null,
      },
    });
    await this.syncInventory(batch.lotId!, batch.stationId, batch.process, batch.grade, batch.screenSize, Number(batch.greenOutputKg) || 0);
    await this.audit.log({ userId: actor.id, action: 'CREATE', entity: 'ProcessingBatch', entityId: batch.id });
    return { ...batch, yieldPct: yieldOf(batch) };
  }

  @Patch(':id')
  @RequirePermissions('processing.write')
  async update(@Param('id') id: string, @Body() body: Partial<ProcessingBatchInput>, @CurrentUser() actor: AuthUser) {
    const batch = await this.prisma.processingBatch.update({ where: { id }, data: body as any });
    await this.syncInventory(batch.lotId!, batch.stationId, batch.process, batch.grade, batch.screenSize, Number(batch.greenOutputKg) || 0);
    await this.audit.log({ userId: actor.id, action: 'UPDATE', entity: 'ProcessingBatch', entityId: id });
    return { ...batch, yieldPct: yieldOf(batch) };
  }

  private async syncInventory(
    lotId: string,
    stationId: string,
    process: string,
    grade: string | null,
    screenSize: string | null,
    greenKg: number,
  ) {
    if (!greenKg) return;
    const warehouse = 'Default';
    const item = await this.prisma.inventoryItem.upsert({
      where: { lotId_warehouse: { lotId, warehouse } },
      create: { lotId, stationId, process, grade, screenSize, quantityKg: greenKg, warehouse },
      update: { quantityKg: greenKg, grade, screenSize },
    });
    await this.prisma.inventoryMovement.create({
      data: { itemId: item.id, direction: 'IN', quantityKg: greenKg, reference: `BATCH ${lotId}` },
    });
  }
}

function yieldOf(batch: { cherryInputKg: any; greenOutputKg: any }) {
  const input = Number(batch.cherryInputKg);
  const out = Number(batch.greenOutputKg);
  if (!input || !out) return null;
  return Number(((out / input) * 100).toFixed(2));
}
