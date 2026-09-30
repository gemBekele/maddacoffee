import { Controller, Get } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { RequirePermissions } from '../common/decorators';

@Controller('dashboard')
export class DashboardController {
  constructor(private prisma: PrismaService) {}

  @Get('summary')
  @RequirePermissions('dashboard.read')
  async summary() {
    const [
      activeStations,
      cherryAgg,
      greenAgg,
      inventoryAgg,
      purchaseAgg,
      expenseAgg,
    ] = await Promise.all([
      this.prisma.station.count({ where: { status: 'Active' } }),
      this.prisma.cherryPurchase.aggregate({ _sum: { cherryKg: true, totalAmount: true } }),
      this.prisma.processingBatch.aggregate({ _sum: { greenOutputKg: true } }),
      this.prisma.inventoryItem.aggregate({ _sum: { quantityKg: true } }),
      this.prisma.cherryPurchase.aggregate({ _sum: { totalAmount: true } }),
      this.prisma.expense.aggregate({ _sum: { amount: true } }),
    ]);

    // Sales are quoted in USD/EUR — convert to ETB using stored exchange rates.
    const [invoices, rates] = await Promise.all([
      this.prisma.commercialInvoice.findMany({ where: { status: { not: 'Draft' } }, include: { lines: true } }),
      this.prisma.exchangeRate.findMany(),
    ]);
    const toEtb = (from: string) => {
      if (from === 'ETB') return 1;
      const r = rates.find((x) => x.fromCode === from && x.toCode === 'ETB');
      return r ? Number(r.rate) : 1;
    };
    const salesRevenue = invoices.reduce(
      (sum, inv) => sum + inv.lines.reduce((a, l) => a + Number(l.amount), 0) * toEtb(inv.currency),
      0,
    );

    const purchaseCost = Number(purchaseAgg._sum.totalAmount ?? 0);
    const stationExpenses = Number(expenseAgg._sum.amount ?? 0);

    return {
      activeStations,
      cherryPurchasedKg: Number(cherryAgg._sum.cherryKg ?? 0),
      greenOutputKg: Number(greenAgg._sum.greenOutputKg ?? 0),
      inventoryKg: Number(inventoryAgg._sum.quantityKg ?? 0),
      purchaseCost,
      stationExpenses,
      salesRevenue,
      grossProfit: salesRevenue - purchaseCost - stationExpenses,
      currency: 'ETB',
    };
  }

  @Get('pending')
  @RequirePermissions('dashboard.read')
  async pending() {
    const [payments, expenses, customerPayments, completedBatches, activeLots] = await Promise.all([
      this.prisma.cherryPurchase.count({ where: { paymentStatus: 'Pending' } }),
      this.prisma.expense.count({ where: { paymentStatus: 'Pending' } }),
      this.prisma.commercialInvoice.count({ where: { status: { in: ['Issued', 'Sent'] } } }),
      this.prisma.processingBatch.count({ where: { status: 'Completed' } }),
      this.prisma.lot.count({ where: { status: 'Active' } }),
    ]);
    return { payments, expenses, customerPayments, completedBatches, activeLots };
  }

  @Get('expense-by-category')
  @RequirePermissions('dashboard.read')
  async expenseByCategory() {
    const rows = await this.prisma.expense.groupBy({
      by: ['category'],
      _sum: { amount: true },
    });
    return rows.map((r) => ({ category: r.category, amount: Number(r._sum.amount ?? 0) }));
  }

  @Get('green-by-process')
  @RequirePermissions('dashboard.read')
  async greenByProcess() {
    const rows = await this.prisma.processingBatch.groupBy({
      by: ['process'],
      _sum: { greenOutputKg: true },
    });
    return rows.map((r) => ({ process: r.process, greenKg: Number(r._sum.greenOutputKg ?? 0) }));
  }

  @Get('station-performance')
  @RequirePermissions('dashboard.read')
  async stationPerformance() {
    const stations = await this.prisma.station.findMany({
      include: {
        purchases: { select: { cherryKg: true, totalAmount: true } },
        batches: { select: { greenOutputKg: true } },
        expenses: { select: { amount: true } },
      },
    });
    return stations.map((s) => {
      const cherryKg = s.purchases.reduce((a, p) => a + Number(p.cherryKg), 0);
      const purchaseCost = s.purchases.reduce((a, p) => a + Number(p.totalAmount), 0);
      const greenKg = s.batches.reduce((a, b) => a + Number(b.greenOutputKg ?? 0), 0);
      const expenses = s.expenses.reduce((a, e) => a + Number(e.amount), 0);
      return {
        stationId: s.id,
        code: s.code,
        name: s.name,
        cherryKg,
        greenKg,
        purchaseCost,
        expenses,
        grossProfit: -(purchaseCost + expenses),
      };
    });
  }

  @Get('monthly-revenue')
  @RequirePermissions('dashboard.read')
  async monthlyRevenue() {
    const invoices = await this.prisma.commercialInvoice.findMany({
      where: { status: { not: 'Draft' } },
      include: { lines: true },
    });
    const months: Record<string, { revenue: number; grossProfit: number }> = {};
    for (let m = 1; m <= 12; m++) months[String(m)] = { revenue: 0, grossProfit: 0 };
    for (const inv of invoices) {
      const m = String(new Date(inv.date).getMonth() + 1);
      const total = inv.lines.reduce((a, l) => a + Number(l.amount), 0);
      months[m].revenue += total;
      months[m].grossProfit += total;
    }
    return Object.entries(months).map(([month, v]) => ({ month: Number(month), ...v }));
  }
}
