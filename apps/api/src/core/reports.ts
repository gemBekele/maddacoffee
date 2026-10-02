import { Controller, Get } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { RequirePermissions, CurrentUser, type AuthUser } from '../common/decorators';
import { stationFilter } from '../common/station-scope';

@Controller('reports')
export class ReportsController {
  constructor(private prisma: PrismaService) {}

  @Get('purchases')
  @RequirePermissions('report.read')
  async purchases(@CurrentUser() user: AuthUser) {
    const rows = await this.prisma.cherryPurchase.findMany({
      where: stationFilter(user),
      include: { supplier: true, station: true },
      orderBy: { date: 'desc' },
    });
    return rows.map((r) => ({
      code: r.code,
      date: r.date,
      station: r.station?.name,
      supplier: r.supplier?.name,
      cherryKg: Number(r.cherryKg),
      pricePerKg: Number(r.pricePerKg),
      total: Number(r.totalAmount),
      currency: r.currency,
      status: r.paymentStatus,
    }));
  }

  @Get('processing')
  @RequirePermissions('report.read')
  async processing(@CurrentUser() user: AuthUser) {
    const rows = await this.prisma.processingBatch.findMany({
      where: stationFilter(user),
      include: { station: true },
      orderBy: { date: 'desc' },
    });
    return rows.map((r) => {
      const input = Number(r.cherryInputKg);
      const out = Number(r.greenOutputKg ?? 0);
      return {
        code: r.code,
        lotId: r.lotId,
        date: r.date,
        station: r.station?.name,
        process: r.process,
        cherryIn: input,
        greenOut: out,
        yieldPct: input && out ? Number(((out / input) * 100).toFixed(2)) : null,
        grade: r.grade,
        status: r.status,
      };
    });
  }

  @Get('inventory-valuation')
  @RequirePermissions('report.read')
  async inventoryValuation(@CurrentUser() user: AuthUser) {
    const items = await this.prisma.inventoryItem.findMany({ where: stationFilter(user), include: { lot: true } });
    const rows = items.map((i) => ({
      lotId: i.lotId,
      process: i.process,
      grade: i.grade,
      quantityKg: Number(i.quantityKg),
      unitCost: Number(i.unitCost),
      value: Number(i.quantityKg) * Number(i.unitCost),
      currency: i.currency,
      warehouse: i.warehouse,
      status: i.status,
    }));
    return { rows, totalValue: rows.reduce((a, r) => a + r.value, 0), totalKg: rows.reduce((a, r) => a + r.quantityKg, 0) };
  }

  @Get('sales')
  @RequirePermissions('report.read')
  async sales() {
    const rows = await this.prisma.commercialInvoice.findMany({ include: { buyer: true, lines: true }, orderBy: { date: 'desc' } });
    return rows.map((r) => ({
      code: r.code,
      date: r.date,
      buyer: r.buyer?.name,
      currency: r.currency,
      quantityKg: r.lines.reduce((a, l) => a + Number(l.quantityKg), 0),
      value: r.lines.reduce((a, l) => a + Number(l.amount), 0),
      status: r.status,
    }));
  }

  @Get('aging')
  @RequirePermissions('report.read')
  async aging(@CurrentUser() user: AuthUser) {
    const now = Date.now();
    const purchases = await this.prisma.cherryPurchase.findMany({
      where: { ...stationFilter(user), paymentStatus: { in: ['Pending', 'Partial'] } },
      include: { supplier: true },
    });
    const expenses = await this.prisma.expense.findMany({
      where: { ...stationFilter(user), paymentStatus: { in: ['Pending', 'Partial'] } },
      include: { station: true },
    });
    const bucket = (d: Date) => {
      const days = Math.floor((now - new Date(d).getTime()) / 86400000);
      if (days <= 30) return '0-30';
      if (days <= 60) return '31-60';
      if (days <= 90) return '61-90';
      return '90+';
    };
    const ap = [
      ...purchases.map((p) => ({ ref: p.code, party: p.supplier?.name, amount: Number(p.totalAmount), currency: p.currency, date: p.date, bucket: bucket(p.date) })),
      ...expenses.map((e) => ({ ref: e.code, party: e.station?.name, amount: Number(e.amount), currency: e.currency, date: e.date, bucket: bucket(e.date) })),
    ];
    const ar = await this.prisma.commercialInvoice.findMany({ where: { status: { in: ['Issued', 'Sent'] } }, include: { buyer: true, lines: true } });
    const receivables = ar.map((r) => ({
      ref: r.code,
      party: r.buyer?.name,
      amount: r.lines.reduce((a, l) => a + Number(l.amount), 0),
      currency: r.currency,
      date: r.date,
      bucket: bucket(r.date),
    }));
    return { payables: ap, receivables };
  }
}
