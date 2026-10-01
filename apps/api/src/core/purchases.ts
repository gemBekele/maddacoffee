import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../common/audit.service';
import { NumberingService } from '../common/numbering.service';
import { RequirePermissions, CurrentUser, type AuthUser } from '../common/decorators';
import { ZodValidationPipe } from '../common/zod.pipe';
import { cherryPurchaseSchema, type CherryPurchaseInput } from '@madda/shared';
import { ApprovalService } from '../common/approval.service';

@Controller('purchases')
export class PurchasesController {
  constructor(
    private prisma: PrismaService,
    private audit: AuditService,
    private numbering: NumberingService,
    private approval: ApprovalService,
  ) {}

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
    // Receipt numbers are assigned by the system so every purchase gets one and
    // none are duplicated. A value supplied by the client is honoured, because
    // some stations issue a pre-printed receipt book and the paper number is
    // the one that has to appear on the record.
    const receiptNo = body.receiptNo?.trim() || (await this.numbering.next('receipt', body.date));
    const totalAmount = Number(body.cherryKg) * Number(body.pricePerKg);
    // Honour the purchase approval setting, which previously had no effect.
    const needs = await this.approval.needed('purchase', totalAmount);
    const purchase = await this.prisma.cherryPurchase.create({
      data: {
        code,
        date: body.date,
        stationId: body.stationId,
        supplierId: body.supplierId,
        receiptNo,
        cherryKg: body.cherryKg,
        pricePerKg: body.pricePerKg,
        totalAmount,
        currency: body.currency,
        paymentStatus: needs ? 'Pending' : body.paymentStatus,
        harvestYear: body.harvestYear ?? null,
        notes: body.notes ?? null,
        createdById: actor.id,
      },
      include: { supplier: true, station: true },
    });
    if (needs) {
      await this.approval.request({
        entity: 'CherryPurchase',
        entityId: purchase.id,
        code,
        summary: `${body.cherryKg} kg cherry from supplier`,
        amount: totalAmount,
        currency: body.currency,
        requestedById: actor.id,
      });
    }
    await this.audit.log({ userId: actor.id, action: 'CREATE', entity: 'CherryPurchase', entityId: purchase.id, after: purchase });
    return { ...purchase, approvalRequired: needs };
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
