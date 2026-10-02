import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Coffee benchmark prices.
 *
 * Upstream, arabica futures are quoted by ICE in US cents per pound. Our own
 * sale prices are in USD per kilogram. Everything crossing this boundary is
 * converted immediately, so a benchmark and a realised price can be compared
 * without the reader having to know which unit they are looking at.
 *
 * Sources, in order of preference:
 *   1. Yahoo Finance chart API for KC=F (ICE arabica front month). No key, but
 *      undocumented, so it is treated as best-effort and never as authoritative.
 *   2. FRED series PCOFFOTMUSDM (IMF other-mild-arabica indicator), monthly. Used
 *      when Yahoo fails or when a longer history is wanted than Yahoo returns.
 *
 * Quotes are cached in Postgres. A chart should not hit an upstream API on every
 * page view, and a cached chart is better than a blank one when the upstream is
 * down. Staleness is surfaced rather than hidden.
 */

const LB_TO_KG = 0.45359237;
const CENTS_TO_USD = 100;

/** US cents per pound -> USD per kilogram. */
export function centsPerLbToUsdPerKg(centsPerLb: number): number {
  return centsPerLb / CENTS_TO_USD / LB_TO_KG;
}

const YAHOO = 'https://query1.finance.yahoo.com/v8/finance/chart';
const FRED = 'https://fred.stlouisfed.org/graph/fredgraph.csv';

/** Yahoo rejects requests without a browser-like agent. */
const UA = 'Mozilla/5.0 (compatible; AncientHalo-Coffee/1.0)';

export type Range = '1d' | '5d' | '1mo' | '3mo' | '6mo' | '1y' | '5y';

/** Yahoo range/interval pairing. Intraday is only offered over short windows. */
const RANGE_CONFIG: Record<Range, { yahooRange: string; interval: string; label: string }> = {
  '1d': { yahooRange: '1d', interval: '5m', label: '1 day' },
  '5d': { yahooRange: '5d', interval: '30m', label: '5 days' },
  '1mo': { yahooRange: '1mo', interval: '1d', label: '1 month' },
  '3mo': { yahooRange: '3mo', interval: '1d', label: '3 months' },
  '6mo': { yahooRange: '6mo', interval: '1d', label: '6 months' },
  '1y': { yahooRange: '1y', interval: '1d', label: '1 year' },
  '5y': { yahooRange: '5y', interval: '1wk', label: '5 years' },
};

/** How long a cached series is considered fresh. */
const CACHE_TTL_MS: Record<string, number> = {
  '5m': 5 * 60_000,
  '30m': 30 * 60_000,
  '1d': 6 * 60 * 60_000,
  '1wk': 24 * 60 * 60_000,
  mo: 7 * 24 * 60 * 60_000,
};

/**
 * Cache key for a request.
 *
 * Several ranges share an upstream interval — 1mo, 3mo, 6mo and 1y are all
 * daily candles. Keying the cache on the interval alone made them collide: the
 * first range fetched wrote a series of its own length, and every other range
 * then served that same series, so asking for a year returned a month. The
 * range is part of the key so each length is stored and served separately.
 */
function cacheKey(range: Range): string {
  return `${RANGE_CONFIG[range]?.interval ?? '1d'}:${range}`;
}

export interface QuotePoint {
  t: string; // ISO timestamp
  o: number | null;
  h: number | null;
  l: number | null;
  c: number;
  v: number | null;
}

@Injectable()
export class MarketService {
  private logger = new Logger('Market');

  constructor(private prisma: PrismaService) {}

  // ── upstream fetch ───────────────────────────────────────────────────

  private async fetchJson(url: string, timeoutMs = 10_000): Promise<any> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(url, {
        signal: controller.signal,
        headers: { 'User-Agent': UA, Accept: 'application/json' },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.json();
    } finally {
      clearTimeout(timer);
    }
  }

  /** Yahoo chart payload -> normalised USD/kg points. */
  private async fetchYahoo(range: Range): Promise<QuotePoint[]> {
    const cfg = RANGE_CONFIG[range];
    const url = `${YAHOO}/KC=F?range=${cfg.yahooRange}&interval=${cfg.interval}`;
    const data = await this.fetchJson(url);
    const result = data?.chart?.result?.[0];
    if (!result) throw new Error(data?.chart?.error?.description ?? 'no result');

    const ts: number[] = result.timestamp ?? [];
    const q = result.indicators?.quote?.[0] ?? {};
    const out: QuotePoint[] = [];
    for (let i = 0; i < ts.length; i++) {
      const close = q.close?.[i];
      // Yahoo pads gaps with nulls; skip them rather than writing a zero.
      if (close === null || close === undefined) continue;
      out.push({
        t: new Date(ts[i] * 1000).toISOString(),
        o: q.open?.[i] != null ? centsPerLbToUsdPerKg(q.open[i]) : null,
        h: q.high?.[i] != null ? centsPerLbToUsdPerKg(q.high[i]) : null,
        l: q.low?.[i] != null ? centsPerLbToUsdPerKg(q.low[i]) : null,
        c: centsPerLbToUsdPerKg(close),
        v: q.volume?.[i] ?? null,
      });
    }
    if (!out.length) throw new Error('empty series');
    return out;
  }

  /** FRED CSV -> monthly USD/kg points. Used as the long-history fallback. */
  private async fetchFred(): Promise<QuotePoint[]> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 10_000);
    let text: string;
    try {
      const res = await fetch(FRED, {
        signal: controller.signal,
        headers: { 'User-Agent': UA },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      text = await res.text();
    } finally {
      clearTimeout(timer);
    }

    const out: QuotePoint[] = [];
    for (const line of text.split('\n').slice(1)) {
      const [date, value] = line.trim().split(',');
      if (!date || !value || value === '.') continue;
      const n = Number(value);
      if (!Number.isFinite(n)) continue;
      out.push({
        t: new Date(`${date}T00:00:00Z`).toISOString(),
        o: null,
        h: null,
        l: null,
        c: centsPerLbToUsdPerKg(n),
        v: null,
      });
    }
    if (!out.length) throw new Error('empty FRED series');
    return out;
  }

  // ── cache ────────────────────────────────────────────────────────────

  private async cached(symbol: string, interval: string) {
    const rows = await this.prisma.coffeeQuote.findMany({
      where: { symbol, interval },
      orderBy: { priceDate: 'asc' },
      take: 5000,
    });
    return rows.map((r) => ({
      t: r.priceDate.toISOString(),
      o: r.open != null ? Number(r.open) : null,
      h: r.high != null ? Number(r.high) : null,
      l: r.low != null ? Number(r.low) : null,
      c: Number(r.close),
      v: r.volume != null ? Number(r.volume) : null,
    })) as QuotePoint[];
  }

  private async cacheAge(symbol: string, interval: string): Promise<number | null> {
    const latest = await this.prisma.coffeeQuote.findFirst({
      where: { symbol, interval },
      orderBy: { fetchedAt: 'desc' },
      select: { fetchedAt: true },
    });
    return latest ? Date.now() - latest.fetchedAt.getTime() : null;
  }

  private async store(symbol: string, interval: string, source: string, points: QuotePoint[]) {
    // Upsert on the natural key so repeated fetches update rather than duplicate.
    for (const p of points) {
      const priceDate = new Date(p.t);
      await this.prisma.coffeeQuote.upsert({
        where: { symbol_interval_priceDate: { symbol, interval, priceDate } },
        create: {
          symbol,
          interval,
          source,
          priceDate,
          open: p.o,
          high: p.h,
          low: p.l,
          close: p.c,
          volume: p.v,
          fetchedAt: new Date(),
        },
        update: {
          open: p.o,
          high: p.h,
          low: p.l,
          close: p.c,
          volume: p.v,
          source,
          fetchedAt: new Date(),
        },
      });
    }
  }

  private async logFetch(source: string, symbol: string, interval: string, ok: boolean, points: number, error?: string) {
    try {
      await this.prisma.marketFetchLog.create({
        data: { source, symbol, interval, ok, points, error: error ?? null },
      });
    } catch {
      // Logging must never break the request path.
    }
  }

  // ── public API ───────────────────────────────────────────────────────

  /**
   * Benchmark series for a range, served from cache when fresh.
   *
   * On a cache miss or stale entry the upstream is tried; if it fails, whatever
   * is cached is returned with `stale: true` so the UI can say so rather than
   * presenting old data as live.
   */
  async benchmark(range: Range) {
    const cfg = RANGE_CONFIG[range] ?? RANGE_CONFIG['1mo'];
    const interval = cfg.interval;
    const key = cacheKey(range);
    const ttl = CACHE_TTL_MS[interval] ?? CACHE_TTL_MS['1d'];
    const age = await this.cacheAge('KC=F', key);

    if (age !== null && age < ttl) {
      const points = await this.cached('KC=F', key);
      if (points.length) {
        return this.series('KC=F', interval, points, false, 'yahoo', age);
      }
    }

    try {
      const points = await this.fetchYahoo(range);
      await this.store('KC=F', key, 'yahoo', points);
      await this.logFetch('yahoo', 'KC=F', key, true, points.length);
      return this.series('KC=F', interval, points, false, 'yahoo', 0);
    } catch (e) {
      const msg = (e as Error).message;
      this.logger.warn(`Yahoo KC=F fetch failed for ${range}: ${msg}`);
      await this.logFetch('yahoo', 'KC=F', key, false, 0, msg);

      // Fall back to the cached series, whatever its age.
      const points = await this.cached('KC=F', key);
      if (points.length) {
        return this.series('KC=F', interval, points, true, 'yahoo', age ?? 0);
      }

      // Nothing cached for this interval: try FRED so the chart is not empty.
      try {
        const fred = await this.fetchFred();
        await this.store('KC=F', 'mo:fred', 'fred', fred);
        await this.logFetch('fred', 'KC=F', 'mo:fred', true, fred.length);
        return this.series('KC=F', 'mo', fred, false, 'fred', 0);
      } catch (e2) {
        await this.logFetch('fred', 'KC=F', 'mo:fred', false, 0, (e2 as Error).message);
        return this.series('KC=F', interval, [], false, 'none', null);
      }
    }
  }

  private series(
    symbol: string,
    interval: string,
    points: QuotePoint[],
    stale: boolean,
    source: string,
    ageMs: number | null,
  ) {
    const last = points.length ? points[points.length - 1] : null;
    const first = points.length ? points[0] : null;
    const change = last && first ? last.c - first.c : null;
    return {
      symbol,
      name: 'ICE Arabica Coffee C (front month)',
      unit: 'USD/kg',
      // Stated explicitly because the upstream quotes cents per pound and a
      // reader comparing the chart to a broker screen needs to know.
      sourceUnit: source === 'fred' ? 'US cents/lb (IMF indicator, monthly)' : 'US cents/lb',
      interval,
      source,
      stale,
      cacheAgeSeconds: ageMs != null ? Math.round(ageMs / 1000) : null,
      points,
      latest: last,
      rangeChange: change,
      rangeChangePct: change != null && first && first.c !== 0 ? (change / first.c) * 100 : null,
      fetchedAt: new Date().toISOString(),
    };
  }

  /** Fetch health, so a silently broken feed is visible. */
  async health() {
    const logs = await this.prisma.marketFetchLog.findMany({
      orderBy: { createdAt: 'desc' },
      take: 20,
    });
    const latestOk = logs.find((l) => l.ok);
    const latestFail = logs.find((l) => !l.ok);
    const cached = await this.prisma.coffeeQuote.count();
    return {
      cachedQuotes: cached,
      lastSuccessAt: latestOk?.createdAt ?? null,
      lastSuccessSource: latestOk?.source ?? null,
      lastFailureAt: latestFail?.createdAt ?? null,
      lastFailure: latestFail?.error ?? null,
      recent: logs,
    };
  }

  /**
   * Our own realised export prices, in USD/kg, averaged per invoice date.
   *
   * This is what makes the benchmark useful: it shows whether the price we
   * actually achieved was above or below the market at the time.
   */
  async realised(fromDays = 365) {
    const since = new Date(Date.now() - fromDays * 24 * 60 * 60 * 1000);
    const lines = await this.prisma.commercialInvoiceLine.findMany({
      where: { invoice: { date: { gte: since } } },
      include: { invoice: { select: { code: true, date: true, currency: true } } },
      orderBy: { invoice: { date: 'asc' } },
    });

    // Group by day: several invoices on one day become one average, which is
    // what belongs on a time axis.
    const byDay = new Map<string, { sumAmount: number; sumKg: number; codes: Set<string> }>();
    for (const l of lines) {
      const kg = Number(l.quantityKg ?? 0);
      if (kg <= 0) continue;
      const day = new Date(l.invoice.date).toISOString().slice(0, 10);
      const cur = byDay.get(day) ?? { sumAmount: 0, sumKg: 0, codes: new Set<string>() };
      cur.sumAmount += Number(l.amount ?? 0);
      cur.sumKg += kg;
      cur.codes.add(l.invoice.code);
      byDay.set(day, cur);
    }

    const points = [...byDay.entries()]
      .map(([date, v]) => ({
        t: new Date(`${date}T00:00:00Z`).toISOString(),
        pricePerKg: v.sumKg > 0 ? v.sumAmount / v.sumKg : 0,
        quantityKg: v.sumKg,
        invoices: [...v.codes],
      }))
      .filter((p) => p.pricePerKg > 0);

    const totalKg = points.reduce((a, p) => a + p.quantityKg, 0);
    const weighted = totalKg > 0 ? points.reduce((a, p) => a + p.pricePerKg * p.quantityKg, 0) / totalKg : null;

    return {
      unit: 'USD/kg',
      points,
      average: weighted,
      totalKg,
      invoiceCount: new Set(points.flatMap((p) => p.invoices)).size,
    };
  }

  /**
   * Benchmark against realised, aligned on a common time axis.
   *
   * For each day we sold, find the most recent benchmark at or before that day,
   * so the comparison is "market at the time we sold" rather than "market now".
   */
  async compare(range: Range) {
    const [bench, realised] = await Promise.all([this.benchmark(range), this.realised(rangeDays(range))]);
    const benchPoints = bench.points;

    const findAt = (iso: string): number | null => {
      const target = new Date(iso).getTime();
      let best: number | null = null;
      for (const p of benchPoints) {
        if (new Date(p.t).getTime() <= target) best = p.c;
        else break;
      }
      return best ?? (benchPoints[0]?.c ?? null);
    };

    const rows = realised.points.map((p) => {
      const market = findAt(p.t);
      const premium = market != null ? p.pricePerKg - market : null;
      return {
        ...p,
        market,
        premiumPerKg: premium,
        premiumPct: premium != null && market ? (premium / market) * 100 : null,
      };
    });

    const priced = rows.filter((r) => r.premiumPerKg != null && r.quantityKg > 0);
    const totalKg = priced.reduce((a, r) => a + r.quantityKg, 0);
    const weightedPremium =
      totalKg > 0 ? priced.reduce((a, r) => a + (r.premiumPerKg as number) * r.quantityKg, 0) / totalKg : null;

    return {
      benchmark: bench,
      realised: realised,
      rows,
      summary: {
        weightedPremiumPerKg: weightedPremium,
        averageRealised: realised.average,
        latestMarket: bench.latest?.c ?? null,
        totalKg,
      },
    };
  }
}

function rangeDays(range: Range): number {
  switch (range) {
    case '1d':
    case '5d':
      return 30;
    case '1mo':
      return 60;
    case '3mo':
      return 120;
    case '6mo':
      return 240;
    case '1y':
      return 400;
    case '5y':
      return 1900;
    default:
      return 400;
  }
}
