import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../common/audit.service';
import { NumberingService } from '../common/numbering.service';
import { RequirePermissions, CurrentUser, type AuthUser } from '../common/decorators';
import { ZodValidationPipe } from '../common/zod.pipe';
import { cherryPurchaseSchema, type CherryPurchaseInput } from '@madda/shared';

@Controller('purchases')
export class PurchasesController {
  constructor(private prisma: PrismaService, private audit: AuditService, private numbering: NumberingService) {}

  @Get()
  @RequirePermissions('purchase.read')
  list(@Query('stationId') stationId?: string, @Query('from') from?: string, @Query('to') to?: string) {
    return this.prisma.cherryPurchase.findMany({
      where: {
        ...(stationId ? { stationId } : {}),
        ...(from || to
          ? { date: { ...(from ? { gte: new Date(from) } : {}), ...(to ? { lte: new Date(to) } : {}) } }
          : {}),
      },
      include: { supplier: true, station: true },
      orderBy: { date: 'desc' },
      take: 500,
    });
  }

  @Post()
  @RequirePermissions('purchase.write')
  async create(@Body(new ZodValidationPipe(cherryPurchaseSchema)) body: CherryPurchaseInput, @CurrentUser() actor: AuthUser) {
    const code = await this.numbering.next('purchase', body.date);
    const totalAmount = Number(body.cherryKg) * Number(body.pricePerKg);
    const purchase = await this.prisma.cherryPurchase.create({
      data: {
        code,
        date: body.date,
        stationId: body.stationId,
        supplierId: body.supplierId,
        receiptNo: body.receiptNo ?? null,
        cherryKg: body.cherryKg,
        pricePerKg: body.pricePerKg,
        totalAmount,
        currency: body.currency,
        paymentStatus: body.paymentStatus,
        harvestYear: body.harvestYear ?? null,
        notes: body.notes ?? null,
        createdById: actor.id,
      },
      include: { supplier: true, station: true },
    });
    await this.audit.log({ userId: actor.id, action: 'CREATE', entity: 'CherryPurchase', entityId: purchase.id, after: purchase });
    return purchase;
  }

  @Patch(':id')
  @RequirePermissions('purchase.write')
  async update(@Param('id') id: string, @Body() body: Partial<CherryPurchaseInput>, @CurrentUser() actor: AuthUser) {
    const data: any = { ...body };
    if (body.cherryKg != null || body.pricePerKg != null) {
      const existing = await this.prisma.cherryPurchase.findUnique({ where: { id } });
      const kg = body.cherryKg ?? Number(existing?.cherryKg);
      const price = body.pricePerKg ?? Number(existing?.pricePerKg);
      data.totalAmount = kg * price;
    }
    const purchase = await this.prisma.cherryPurchase.update({ where: { id }, data });
    await this.audit.log({ userId: actor.id, action: 'UPDATE', entity: 'CherryPurchase', entityId: id });
    return purchase;
  }
}
