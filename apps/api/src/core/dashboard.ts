import { Controller, Get, Query } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { RequirePermissions } from '../common/decorators';
import { MarketService } from './market.service';

/**
 * Dashboard data.
 *
 * `overview` is the endpoint the redesigned dashboard uses: it returns every
 * panel in one response so the filters apply consistently across the page, and
 * so the browser makes one request rather than seven.
 *
 * The individual endpoints are kept because they are cheap and remain useful
 * for embedding a single panel elsewhere.
 */
@Controller('dashboard')
export class DashboardController {
  constructor(
    private prisma: PrismaService,
    private market: MarketService,
  ) {}

  /** Parse a YYYY-MM-DD bound, defaulting to a 90-day window ending today. */
  private window(from?: string, to?: string) {
    const toDate = to ? new Date(`${to}T23:59:59.999Z`) : new Date();
    const fromDate = from
      ? new Date(`${from}T00:00:00.000Z`)
      : new Date(toDate.getTime() - 90 * 24 * 60 * 60 * 1000);
    return { fromDate, toDate };
  }

  private dayKey(d: Date) {
    return new Date(d).toISOString().slice(0, 10);
  }

  /** Bucket rows into a dense daily series so the chart has no gaps. */
  private dailySeries(
    from: Date,
    to: Date,
    rows: { date: Date; value: number }[],
  ): { days: string[]; values: number[] } {
    const days: string[] = [];
    const index = new Map<string, number>();
    // Cap the number of buckets so a very wide range cannot produce a huge array.
    const step = Math.max(1, Math.ceil((to.getTime() - from.getTime()) / (366 * 24 * 60 * 60 * 1000)));
    for (let t = from.getTime(); t <= to.getTime(); t += step * 24 * 60 * 60 * 1000) {
      const key = this.dayKey(new Date(t));
      index.set(key, days.length);
      days.push(key);
    }
    const values = new Array(days.length).fill(0);
    for (const r of rows) {
      const key = this.dayKey(r.date);
      // Rows outside the bucket boundaries fall on the nearest bucket.
      let i = index.get(key);
      if (i === undefined) {
        i = values.length - 1;
        for (let k = 0; k < days.length; k++) if (days[k] <= key) i = k;
      }
      values[i] += r.value;
    }
    return { days, values };
  }

  @Get('overview')
  @RequirePermissions('dashboard.read')
  async overview(
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('stationId') stationId?: string,
  ) {
    const { fromDate, toDate } = this.window(from, to);
    const inWindow = { gte: fromDate, lte: toDate };
    const stationWhere = stationId ? { stationId } : {};

    const [
      stations,
      purchases,
      batches,
      inventory,
      expenses,
      invoices,
      rates,
      activeStations,
      pendingPayments,
      pendingExpenses,
      activeLots,
      completedBatches,
      buyers,
    ] = await Promise.all([
      this.prisma.station.findMany({ orderBy: { name: 'asc' } }),
      this.prisma.cherryPurchase.findMany({
        where: { date: inWindow, ...stationWhere },
        select: { date: true, cherryKg: true, totalAmount: true, stationId: true },
      }),
      this.prisma.processingBatch.findMany({
        where: { date: inWindow, ...stationWhere },
        select: { date: true, greenOutputKg: true, cherryInputKg: true, process: true, stationId: true },
      }),
      this.prisma.inventoryItem.findMany({
        where: stationId ? { stationId } : {},
        select: { quantityKg: true, stationId: true },
      }),
      this.prisma.expense.findMany({
        where: { date: inWindow, ...stationWhere },
        select: { date: true, amount: true, category: true, stationId: true },
      }),
      this.prisma.commercialInvoice.findMany({
        where: { date: inWindow, status: { not: 'Draft' } },
        include: { lines: true, buyer: { select: { id: true, name: true, country: true } } },
      }),
      this.prisma.exchangeRate.findMany(),
      this.prisma.station.count({ where: { status: 'Active' } }),
      this.prisma.cherryPurchase.count({ where: { paymentStatus: 'Pending' } }),
      this.prisma.expense.count({ where: { paymentStatus: 'Pending' } }),
      this.prisma.lot.count({ where: { status: 'Active' } }),
      this.prisma.processingBatch.count({ where: { status: 'Completed' } }),
      this.prisma.buyer.findMany({ select: { id: true, name: true, country: true } }),
    ]);

    const toEtb = (code: string) => {
      if (code === 'ETB') return 1;
      const r = rates.find((x) => x.fromCode === code && x.toCode === 'ETB');
      return r ? Number(r.rate) : 1;
    };
    // Buyer concentration is more meaningful in the currency the coffee is sold
    // in, so exports are converted to USD rather than to birr.
    const toUsd = (code: string) => {
      if (code === 'USD') return 1;
      if (code === 'ETB') {
        const r = rates.find((x) => x.fromCode === 'USD' && x.toCode === 'ETB');
        return r && Number(r.rate) > 0 ? 1 / Number(r.rate) : 1;
      }
      const toEtbRate = rates.find((x) => x.fromCode === code && x.toCode === 'ETB');
      const usdEtb = rates.find((x) => x.fromCode === 'USD' && x.toCode === 'ETB');
      if (toEtbRate && usdEtb && Number(usdEtb.rate) > 0) return Number(toEtbRate.rate) / Number(usdEtb.rate);
      return 1;
    };

    // ── totals ──────────────────────────────────────────────────────────
    const cherryKg = purchases.reduce((a, p) => a + Number(p.cherryKg), 0);
    const cherryCost = purchases.reduce((a, p) => a + Number(p.totalAmount), 0);
    const greenKg = batches.reduce((a, b) => a + Number(b.greenOutputKg ?? 0), 0);
    const cherryInputKg = batches.reduce((a, b) => a + Number(b.cherryInputKg ?? 0), 0);
    const expenseTotal = expenses.reduce((a, e) => a + Number(e.amount), 0);
    const inventoryKg = inventory.reduce((a, i) => a + Number(i.quantityKg), 0);

    const salesUsd = invoices.reduce(
      (sum, inv) => sum + inv.lines.reduce((a, l) => a + Number(l.amount), 0) * toUsd(inv.currency),
      0,
    );
    const salesEtb = invoices.reduce(
      (sum, inv) => sum + inv.lines.reduce((a, l) => a + Number(l.amount), 0) * toEtb(inv.currency),
      0,
    );
    const soldKg = invoices.reduce(
      (sum, inv) => sum + inv.lines.reduce((a, l) => a + Number(l.quantityKg), 0),
      0,
    );
    const grossProfit = salesEtb - cherryCost - expenseTotal;

    // ── daily trends for the card sparklines ────────────────────────────
    const cherrySeries = this.dailySeries(
      fromDate,
      toDate,
      purchases.map((p) => ({ date: p.date, value: Number(p.cherryKg) })),
    );
    const greenSeries = this.dailySeries(
      fromDate,
      toDate,
      batches.map((b) => ({ date: b.date, value: Number(b.greenOutputKg ?? 0) })),
    );
    const expenseSeries = this.dailySeries(
      fromDate,
      toDate,
      expenses.map((e) => ({ date: e.date, value: Number(e.amount) })),
    );
    const purchaseCostSeries = this.dailySeries(
      fromDate,
      toDate,
      purchases.map((p) => ({ date: p.date, value: Number(p.totalAmount) })),
    );
    const revenueSeries = this.dailySeries(
      fromDate,
      toDate,
      invoices.map((inv) => ({
        date: inv.date,
        value: inv.lines.reduce((a, l) => a + Number(l.amount), 0) * toEtb(inv.currency),
      })),
    );

    // Running inventory: green produced minus green shipped, cumulatively.
    const producedCum: number[] = [];
    const shippedCum: number[] = [];
    let pc = 0;
    let sc = 0;
    for (let i = 0; i < greenSeries.days.length; i++) {
      pc += greenSeries.values[i];
      const day = greenSeries.days[i];
      const shipped = invoices
        .filter((inv) => this.dayKey(inv.date) === day)
        .reduce((a, inv) => a + inv.lines.reduce((s, l) => s + Number(l.quantityKg), 0), 0);
      sc += shipped;
      producedCum.push(pc);
      shippedCum.push(sc);
    }
    const inventorySeries = producedCum.map((p, i) => p - shippedCum[i]);

    // ── breakdowns ──────────────────────────────────────────────────────
    const byCategory = new Map<string, number>();
    for (const e of expenses) byCategory.set(e.category, (byCategory.get(e.category) ?? 0) + Number(e.amount));

    // Expense mix: cumulative spend across the period with the largest
    // categories called out, plus a share figure for the top one. A flat
    // category breakdown says what was spent; this says how concentrated it is
    // and how it has accumulated.
    const categoryRows = [...byCategory.entries()]
      .map(([category, amount]) => ({ category, amount }))
      .sort((a, b) => b.amount - a.amount);
    const topCategory = categoryRows[0] ?? null;

    let expenseCumulative = 0;
    const expenseCumulativeSeries = expenseSeries.values.map((v) => {
      expenseCumulative += v;
      return expenseCumulative;
    });
    // A category is worth naming as a driver when it carries a meaningful share.
    const significantCategories = categoryRows.filter(
      (c) => expenseTotal > 0 && (c.amount / expenseTotal) * 100 >= 12,
    );
    const midPeriod = Math.floor(expenseSeries.values.length / 2);
    const firstHalf = expenseSeries.values.slice(0, midPeriod).reduce((a, b) => a + b, 0);
    const secondHalf = expenseSeries.values.slice(midPeriod).reduce((a, b) => a + b, 0);
    const trend =
      firstHalf === 0 && secondHalf === 0
        ? 'flat'
        : secondHalf > firstHalf * 1.15
          ? 'rising'
          : secondHalf < firstHalf * 0.85
            ? 'falling'
            : 'steady';

    const byProcess = new Map<string, number>();
    for (const b of batches) {
      const p = b.process ?? 'Other';
      byProcess.set(p, (byProcess.get(p) ?? 0) + Number(b.greenOutputKg ?? 0));
    }

    const byStation = stations
      .filter((s) => !stationId || s.id === stationId)
      .map((s) => {
        const p = purchases.filter((x) => x.stationId === s.id);
        const b = batches.filter((x) => x.stationId === s.id);
        const e = expenses.filter((x) => x.stationId === s.id);
        const cKg = p.reduce((a, x) => a + Number(x.cherryKg), 0);
        const cCost = p.reduce((a, x) => a + Number(x.totalAmount), 0);
        const gKg = b.reduce((a, x) => a + Number(x.greenOutputKg ?? 0), 0);
        const exp = e.reduce((a, x) => a + Number(x.amount), 0);
        return {
          stationId: s.id,
          code: s.code,
          name: s.name,
          cherryKg: cKg,
          greenKg: gKg,
          purchaseCost: cCost,
          expenses: exp,
          // Yield is the number a station manager is judged on.
          yieldPct: cKg > 0 ? (gKg / cKg) * 100 : null,
          costPerKgGreen: gKg > 0 ? (cCost + exp) / gKg : null,
        };
      })
      .filter((s) => s.cherryKg > 0 || s.greenKg > 0 || s.expenses > 0);

    // Buyer concentration: a few buyers carrying everything is a risk worth
    // seeing rather than discovering.
    const buyerTotals = new Map<string, { name: string; country: string | null; amount: number; kg: number; invoices: number }>();
    for (const inv of invoices) {
      const total = inv.lines.reduce((a, l) => a + Number(l.amount), 0) * toUsd(inv.currency);
      const kg = inv.lines.reduce((a, l) => a + Number(l.quantityKg), 0);
      const key = inv.buyer?.id ?? 'unknown';
      const cur = buyerTotals.get(key) ?? {
        name: inv.buyer?.name ?? 'Unknown',
        country: inv.buyer?.country ?? null,
        amount: 0,
        kg: 0,
        invoices: 0,
      };
      cur.amount += total;
      cur.kg += kg;
      cur.invoices += 1;
      buyerTotals.set(key, cur);
    }
    const topBuyers = [...buyerTotals.values()].sort((a, b) => b.amount - a.amount).slice(0, 5);

    // ── market ──────────────────────────────────────────────────────────
    // Never let a dead price feed take the dashboard down.
    let market: any = null;
    try {
      const bench = await this.market.benchmark('3mo');
      market = {
        price: bench.latest?.c ?? null,
        unit: bench.unit,
        changePct: bench.rangeChangePct,
        change: bench.rangeChange,
        source: bench.source,
        stale: bench.stale,
        spark: bench.points.map((p) => ({ t: p.t, c: p.c })),
      };
    } catch {
      market = null;
    }

    const selectedStation = stationId ? stations.find((s) => s.id === stationId) ?? null : null;

    return {
      filters: {
        from: fromDate.toISOString().slice(0, 10),
        to: toDate.toISOString().slice(0, 10),
        stationId: stationId ?? null,
        stationName: selectedStation?.name ?? null,
      },
      // Sales are not attributable to a station in this data model, so when a
      // station filter is active the commercial figures stay company-wide and
      // the UI says so rather than implying they were filtered.
      stationScoped: !!stationId,
      summary: {
        activeStations,
        cherryPurchasedKg: cherryKg,
        greenOutputKg: greenKg,
        inventoryKg,
        purchaseCost: cherryCost,
        stationExpenses: expenseTotal,
        salesRevenue: salesEtb,
        salesRevenueUsd: salesUsd,
        grossProfit,
        currency: 'ETB',
        // Derived insight, which is what the page is for.
        yieldPct: cherryInputKg > 0 ? (greenKg / cherryInputKg) * 100 : null,
        marginPct: salesEtb > 0 ? (grossProfit / salesEtb) * 100 : null,
        avgPurchasePricePerKg: cherryKg > 0 ? cherryCost / cherryKg : null,
        avgSalePricePerKg: soldKg > 0 ? salesUsd / soldKg : null,
        soldKg,
        costPerKgGreen: greenKg > 0 ? (cherryCost + expenseTotal) / greenKg : null,
      },
      pending: { payments: pendingPayments, expenses: pendingExpenses, activeLots, completedBatches },
      trends: {
        days: cherrySeries.days,
        cherryKg: cherrySeries.values,
        greenKg: greenSeries.values,
        expenses: expenseSeries.values,
        purchaseCost: purchaseCostSeries.values,
        revenue: revenueSeries.values,
        inventoryKg: inventorySeries,
        // Revenue less the costs incurred that day. A daily profit line is
        // lumpy because sales and purchases fall on different days, but the
        // shape is still what the page is for.
        profit: revenueSeries.values.map(
          (r, i) => r - (purchaseCostSeries.values[i] ?? 0) - (expenseSeries.values[i] ?? 0),
        ),
      },
      expenseByCategory: categoryRows,
      expenseInsight: {
        total: expenseTotal,
        topCategory: topCategory ? topCategory.category : null,
        topCategoryAmount: topCategory ? topCategory.amount : 0,
        topCategorySharePct:
          topCategory && expenseTotal > 0 ? (topCategory.amount / expenseTotal) * 100 : null,
        significantCategories: significantCategories.slice(0, 3),
        categoryCount: categoryRows.length,
        // First half of the period against the second, so the direction is
        // visible without reading a chart.
        trend,
        firstHalf,
        secondHalf,
        cumulativeSeries: expenseCumulativeSeries,
        // What the non-cherry spend adds to the cost of each kilogram of green.
        overheadPerKgGreen:
          greenKg > 0 ? expenseTotal / greenKg : null,
      },
      greenByProcess: [...byProcess.entries()].map(([process, greenKg]) => ({ process, greenKg })),
      stationPerformance: byStation,
      topBuyers,
      market,
    };
  }

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
