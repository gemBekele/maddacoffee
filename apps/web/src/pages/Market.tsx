import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import {
  ComposedChart,
  Line,
  Scatter,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
  ReferenceLine,
} from 'recharts';
import { TrendingUp, TrendingDown, Coffee, AlertTriangle, ExternalLink, Activity } from 'lucide-react';
import { api } from '@/lib/api';
import { PageHeader } from '@/components/PageHeader';
import { Card, StatCard, EmptyState, StatusPill } from '@/components/ui';

const RANGES: { key: string; label: string }[] = [
  { key: '1d', label: '1D' },
  { key: '5d', label: '5D' },
  { key: '1mo', label: '1M' },
  { key: '3mo', label: '3M' },
  { key: '6mo', label: '6M' },
  { key: '1y', label: '1Y' },
  { key: '5y', label: '5Y' },
];

const money = (n: number | null | undefined, dp = 2) =>
  n === null || n === undefined || !Number.isFinite(n) ? '—' : `$${n.toFixed(dp)}`;

/** Tick label density depends on how much history is on screen. */
function tickFormatter(range: string) {
  return (value: number) => {
    const d = new Date(value);
    if (range === '1d') return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    if (range === '5d') return d.toLocaleDateString([], { day: 'numeric', month: 'short' });
    if (range === '5y' || range === '1y') return d.toLocaleDateString([], { month: 'short', year: '2-digit' });
    return d.toLocaleDateString([], { day: 'numeric', month: 'short' });
  };
}

function CustomTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  const rows = payload.filter((p: any) => p.value !== null && p.value !== undefined);
  if (!rows.length) return null;
  const d = new Date(label);
  const market = rows.find((r: any) => r.dataKey === 'market')?.value;
  const ours = rows.find((r: any) => r.dataKey === 'ours')?.value;
  const premium = ours != null && market != null ? ours - market : null;

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-2.5 text-xs shadow-lg">
      <div className="mb-1.5 font-medium text-slate-700">
        {d.toLocaleDateString([], { day: 'numeric', month: 'short', year: 'numeric' })}
      </div>
      {market != null && (
        <div className="flex items-center gap-2 text-slate-600">
          <span className="h-2 w-2 rounded-full bg-brand-600" />
          Market <span className="ml-auto font-medium text-slate-800">{money(market)}/kg</span>
        </div>
      )}
      {ours != null && (
        <div className="mt-0.5 flex items-center gap-2 text-slate-600">
          <span className="h-2 w-2 rounded-full bg-copper-500" />
          We sold <span className="ml-auto font-medium text-slate-800">{money(ours)}/kg</span>
        </div>
      )}
      {premium != null && (
        <div
          className={`mt-1.5 border-t border-slate-100 pt-1.5 font-medium ${
            premium >= 0 ? 'text-emerald-700' : 'text-rose-700'
          }`}
        >
          {premium >= 0 ? '+' : ''}
          {premium.toFixed(3)}/kg vs market
        </div>
      )}
    </div>
  );
}

/**
 * Coffee benchmark against our own realised export prices.
 *
 * The comparison is deliberately "market on the day we sold", not "market now":
 * a premium earned on an August shipment should be judged against the August
 * price, otherwise the figure drifts every time the market moves.
 */
export function MarketPage() {
  const { t } = useTranslation();
  const [range, setRange] = useState('6mo');

  const { data, isLoading } = useQuery({
    queryKey: ['market', 'compare', range],
    queryFn: async () => (await api.get(`/market/compare?range=${range}`)).data,
    refetchInterval: 5 * 60_000,
  });

  const { data: health } = useQuery({
    queryKey: ['market', 'health'],
    queryFn: async () => (await api.get('/market/health')).data,
  });

  // Recharts needs one row per x value, so the benchmark and the realised points
  // are merged onto a shared numeric time axis. `connectNulls` then draws the
  // market line across the gaps where we have no sale.
  const series = useMemo(() => {
    if (!data) return [];
    const rows = new Map<number, { ts: number; market?: number; ours?: number; invoices?: string[]; qty?: number }>();
    for (const p of data.benchmark?.points ?? []) {
      const ts = new Date(p.t).getTime();
      rows.set(ts, { ...(rows.get(ts) ?? { ts }), market: p.c });
    }
    for (const r of data.rows ?? []) {
      const ts = new Date(r.t).getTime();
      rows.set(ts, { ...(rows.get(ts) ?? { ts }), ours: r.pricePerKg, invoices: r.invoices, qty: r.quantityKg });
    }
    return [...rows.values()].sort((a, b) => a.ts - b.ts);
  }, [data]);

  const summary = data?.summary;
  const bench = data?.benchmark;
  const premium = summary?.weightedPremiumPerKg;
  const hasSales = (data?.rows ?? []).length > 0;

  return (
    <div>
      <PageHeader
        title="Coffee Market"
        subtitle="ICE arabica benchmark against our realised export prices"
      />

      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard
          label="Market now"
          value={money(summary?.latestMarket)}
          trend={bench?.rangeChangePct != null ? `${bench.rangeChangePct >= 0 ? '+' : ''}${bench.rangeChangePct.toFixed(2)}% this period` : undefined}
          icon={<Activity size={18} />}
        />
        <StatCard label="Our average price" value={money(summary?.averageRealised)} icon={<Coffee size={18} />} />
        <StatCard
          label="Premium over market"
          value={premium != null ? `${premium >= 0 ? '+' : ''}${money(premium)}` : '—'}
          trend={premium != null ? `${premium >= 0 ? 'above' : 'below'} benchmark per kg` : undefined}
          icon={premium != null && premium >= 0 ? <TrendingUp size={18} /> : <TrendingDown size={18} />}
        />
        <StatCard
          label="Volume sold"
          value={summary?.totalKg ? `${(summary.totalKg / 1000).toFixed(1)} t` : '—'}
          trend={data?.realised?.invoiceCount ? `${data.realised.invoiceCount} invoices` : undefined}
        />
      </div>

      {bench?.stale && (
        <div className="mb-4 flex items-start gap-2 rounded-lg bg-amber-50 p-3 text-xs text-amber-900 ring-1 ring-amber-600/15">
          <AlertTriangle size={14} className="mt-0.5 shrink-0" />
          <div>
            <span className="font-semibold">Showing cached market data.</span> The price feed could not be
            reached, so this chart may be out of date.
            {health?.lastFailure ? <span className="block text-amber-800">Last error: {health.lastFailure}</span> : null}
          </div>
        </div>
      )}

      <Card className="mb-4 p-5">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="text-sm font-semibold text-slate-800">{bench?.name ?? 'Arabica coffee'}</h3>
            <p className="text-xs text-slate-400">
              {bench?.unit ?? 'USD/kg'}
              {bench?.sourceUnit ? ` · quoted upstream in ${bench.sourceUnit}` : ''}
              {bench?.source ? ` · source ${bench.source}` : ''}
            </p>
          </div>
          <div className="flex gap-0.5 rounded-lg bg-slate-100 p-0.5">
            {RANGES.map((r) => (
              <button
                key={r.key}
                onClick={() => setRange(r.key)}
                className={`rounded-md px-2.5 py-1 text-xs font-medium transition ${
                  range === r.key ? 'bg-white text-brand-800 shadow-sm' : 'text-slate-500 hover:text-slate-800'
                }`}
              >
                {r.label}
              </button>
            ))}
          </div>
        </div>

        {isLoading ? (
          <div className="grid h-72 place-items-center text-sm text-slate-400">Loading market data…</div>
        ) : series.length === 0 ? (
          <EmptyState title="No market data available" hint="The price feed is unreachable and nothing is cached." />
        ) : (
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={series} margin={{ top: 6, right: 8, bottom: 0, left: -12 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#eef1ee" vertical={false} />
                <XAxis
                  dataKey="ts"
                  type="number"
                  scale="time"
                  domain={['dataMin', 'dataMax']}
                  tickFormatter={tickFormatter(range)}
                  tick={{ fontSize: 11, fill: '#94a3b8' }}
                  axisLine={{ stroke: '#e5e7eb' }}
                  tickLine={false}
                  minTickGap={28}
                />
                <YAxis
                  tick={{ fontSize: 11, fill: '#94a3b8' }}
                  axisLine={false}
                  tickLine={false}
                  domain={['auto', 'auto']}
                  tickFormatter={(v) => `$${Number(v).toFixed(1)}`}
                  width={52}
                />
                <Tooltip content={<CustomTooltip />} />
                <Legend
                  verticalAlign="top"
                  height={28}
                  iconType="plainline"
                  wrapperStyle={{ fontSize: 12, color: '#475569' }}
                />
                {summary?.averageRealised != null && (
                  <ReferenceLine
                    y={summary.averageRealised}
                    stroke="#ad7846"
                    strokeDasharray="4 4"
                    strokeOpacity={0.5}
                  />
                )}
                <Line
                  type="monotone"
                  dataKey="market"
                  name="ICE arabica benchmark"
                  stroke="#35502f"
                  strokeWidth={2}
                  dot={false}
                  connectNulls
                  isAnimationActive={false}
                />
                <Scatter
                  dataKey="ours"
                  name="Our realised price"
                  fill="#ad7846"
                  shape="circle"
                  legendType="circle"
                  isAnimationActive={false}
                />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        )}

        <p className="mt-3 text-[11px] leading-relaxed text-slate-400">
          Benchmark is ICE Arabica Coffee C, front month, converted from US cents per pound to USD per
          kilogram. Dashed line is our volume-weighted average realised price. An unkeyed public feed is used,
          so treat the benchmark as indicative rather than as a trading quote.
        </p>
      </Card>

      <Card>
        <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
          <div>
            <h3 className="text-sm font-semibold text-slate-700">Sold against market</h3>
            <p className="text-xs text-slate-400">
              Each sale compared with the benchmark on the day it was invoiced
            </p>
          </div>
          <StatusPill status={`${(data?.rows ?? []).length} sales`} />
        </div>

        {!hasSales ? (
          <EmptyState
            title="No sales in this period"
            hint="Issue a commercial invoice to see how your price compares with the market."
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-[10px] uppercase tracking-wide text-slate-400">
                  <th className="px-4 py-2 text-left font-semibold">Date</th>
                  <th className="px-4 py-2 text-left font-semibold">Invoices</th>
                  <th className="px-4 py-2 text-right font-semibold">Volume</th>
                  <th className="px-4 py-2 text-right font-semibold">Our price</th>
                  <th className="px-4 py-2 text-right font-semibold">Market</th>
                  <th className="px-4 py-2 text-right font-semibold">Premium</th>
                </tr>
              </thead>
              <tbody>
                {(data?.rows ?? [])
                  .slice()
                  .reverse()
                  .map((r: any) => (
                    <tr key={r.t} className="border-b border-slate-100 last:border-0 hover:bg-slate-50">
                      <td className="whitespace-nowrap px-4 py-2 text-slate-600">
                        {new Date(r.t).toLocaleDateString([], { day: 'numeric', month: 'short', year: 'numeric' })}
                      </td>
                      <td className="px-4 py-2 font-mono text-xs text-slate-500">{r.invoices.join(', ')}</td>
                      <td className="px-4 py-2 text-right text-slate-600">{r.quantityKg.toFixed(0)} kg</td>
                      <td className="px-4 py-2 text-right font-medium text-slate-800">{money(r.pricePerKg)}</td>
                      <td className="px-4 py-2 text-right text-slate-600">{money(r.market)}</td>
                      <td
                        className={`px-4 py-2 text-right font-medium ${
                          r.premiumPerKg >= 0 ? 'text-emerald-700' : 'text-rose-700'
                        }`}
                      >
                        {r.premiumPerKg != null
                          ? `${r.premiumPerKg >= 0 ? '+' : ''}${money(r.premiumPerKg)} (${r.premiumPct >= 0 ? '+' : ''}${r.premiumPct.toFixed(1)}%)`
                          : '—'}
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {health?.lastSuccessAt && (
        <p className="mt-3 flex items-center gap-1.5 text-[11px] text-slate-400">
          <ExternalLink size={11} />
          Last successful fetch {new Date(health.lastSuccessAt).toLocaleString()} from {health.lastSuccessSource} ·{' '}
          {health.cachedQuotes} cached points
        </p>
      )}
    </div>
  );
}
