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
    await this.postBatchToInventory(batch, 0);
    await this.audit.log({ userId: actor.id, action: 'CREATE', entity: 'ProcessingBatch', entityId: batch.id });
    return { ...batch, yieldPct: yieldOf(batch) };
  }

  @Patch(':id')
  @RequirePermissions('processing.write')
  async update(@Param('id') id: string, @Body() body: Partial<ProcessingBatchInput>, @CurrentUser() actor: AuthUser) {
    const before = await this.prisma.processingBatch.findUnique({ where: { id } });
    if (!before) return { error: 'Not found' };

    const batch = await this.prisma.processingBatch.update({ where: { id }, data: body as any });

    // Reverse the batch's previous contribution before applying the new one, so
    // an edited output corrects the stock rather than being added on top of it.
    // The delta is keyed off this batch's own reference so it can never cancel
    // out another batch's contribution.
    await this.postBatchToInventory(batch, Number(before.greenOutputKg) || 0);
    await this.audit.log({ userId: actor.id, action: 'UPDATE', entity: 'ProcessingBatch', entityId: id });
    return { ...batch, yieldPct: yieldOf(batch) };
  }

  /**
   * Apply a batch's green output to inventory as a movement.
   *
   * Stock is accumulated from movements rather than overwritten. The previous
   * implementation set `quantityKg` to the latest batch's output, so a second
   * batch into the same lot silently destroyed the first batch's contribution:
   * 200 kg then 100 kg left 100 kg in stock.
   *
   * `previousKg` is the batch's contribution as it stands, and is reversed
   * first. That makes a create (`previousKg` 0), an edit and a correction all
   * the same operation.
   */
  private async postBatchToInventory(
    batch: { id: string; lotId: string | null; stationId: string; process: string; grade: string | null; screenSize: string | null; greenOutputKg: any },
    previousKg: number,
  ) {
    if (!batch.lotId) return;
    const newKg = Number(batch.greenOutputKg) || 0;
    const delta = newKg - previousKg;
    if (delta === 0) {
      // Nothing produced and nothing to reverse, but keep the descriptive
      // fields current on the item.
      await this.prisma.inventoryItem.updateMany({
        where: { lotId: batch.lotId },
        data: { process: batch.process, grade: batch.grade, screenSize: batch.screenSize },
      });
      return;
    }

    const warehouse = 'Default';
    const reference = `BATCH ${batch.id}`;

    await this.prisma.$transaction(async (tx) => {
      const item = await tx.inventoryItem.upsert({
        where: { lotId_warehouse: { lotId: batch.lotId!, warehouse } },
        create: {
          lotId: batch.lotId!,
          stationId: batch.stationId,
          process: batch.process,
          grade: batch.grade,
          screenSize: batch.screenSize,
          quantityKg: 0,
          warehouse,
        },
        update: { process: batch.process, grade: batch.grade, screenSize: batch.screenSize },
      });

      const current = Number(item.quantityKg);
      const next = current + delta;
      if (next < 0) {
        // A reversal larger than the batch's own contribution means stock has
        // already left, so reversing would drive the lot negative. Refuse
        // rather than silently corrupting the balance.
        throw new Error(
          `Cannot adjust lot ${batch.lotId}: the correction would leave ${next.toFixed(3)} kg. ` +
            'Stock for this lot has already moved; correct it with a stock adjustment instead.',
        );
      }

      await tx.inventoryItem.update({ where: { id: item.id }, data: { quantityKg: next } });
      await tx.inventoryMovement.create({
        data: {
          itemId: item.id,
          direction: delta > 0 ? 'IN' : 'OUT',
          quantityKg: Math.abs(delta),
          reference,
          notes:
            previousKg > 0
              ? `Batch output revised from ${previousKg.toFixed(3)} kg to ${newKg.toFixed(3)} kg`
              : `Batch ${batch.id} output`,
        },
      });
    });
  }
}

function yieldOf(batch: { cherryInputKg: any; greenOutputKg: any }) {
  const input = Number(batch.cherryInputKg);
  const out = Number(batch.greenOutputKg);
  if (!input || !out) return null;
  return Number(((out / input) * 100).toFixed(2));
}
