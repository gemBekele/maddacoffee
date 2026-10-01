import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  AreaChart,
  Area,
} from 'recharts';
import {
  Coffee,
  Leaf,
  Package,
  Warehouse,
  TrendingUp,
  TrendingDown,
  Printer,
  Download,
  Activity,
  Users,
  Percent,
  Wallet,
  Receipt,
  RefreshCw,
  FileCheck,
} from 'lucide-react';
import { PageHeader } from '@/components/PageHeader';
import { Card, StatusPill } from '@/components/ui';
import { Sparkline } from '@/components/Sparkline';
import { DataTable } from '@/components/DataTable';
import { api } from '@/lib/api';
import { exportRows, printPage } from '@/lib/export';
import { formatKg, formatMoney } from '@madda/shared';


const RANGES = [
  { key: '30', label: '1M', days: 30, full: 'last 30 days' },
  { key: '90', label: '3M', days: 90, full: 'last 3 months' },
  { key: '180', label: '6M', days: 180, full: 'last 6 months' },
  { key: '365', label: '1Y', days: 365, full: 'last 12 months' },
  { key: 'all', label: 'All', days: null, full: 'all time' },
];

/** Timeframes offered on the market card. Deliberately separate from the page. */
const MARKET_RANGES = [
  { key: '1mo', label: '1M', full: '1 month' },
  { key: '3mo', label: '3M', full: '3 months' },
  { key: '6mo', label: '6M', full: '6 months' },
  { key: '1y', label: '1Y', full: '1 year' },
];

function isoDaysAgo(days: number) {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

/**
 * A KPI card.
 *
 * The trend line sits to the right of the figure rather than underneath it, so
 * the number and its direction read as one unit and the card stays short. Cards
 * only carry a sparkline where the shape carries information — a flat staffing
 * count or a buyer total does not need one.
 */
function KpiCard({
  label,
  value,
  sub,
  subTone,
  spark,
  colour = '#4c6b46',
  icon,
  formatValue,
}: {
  label: string;
  value: string;
  sub?: string;
  subTone?: 'up' | 'down' | 'muted';
  spark?: any[];
  colour?: string;
  icon?: React.ReactNode;
  formatValue?: (v: number) => string;
}) {
  const toneClass =
    subTone === 'up' ? 'text-emerald-600' : subTone === 'down' ? 'text-rose-600' : 'text-slate-400';
  return (
    <Card className="p-4">
      <div className="flex items-stretch gap-3">
        <div className="flex min-w-0 flex-1 flex-col">
          <div className="flex items-start justify-between gap-2">
            <span className="text-xs font-medium text-slate-500">{label}</span>
            {icon && <span className="shrink-0 text-slate-300">{icon}</span>}
          </div>
          <div className="mt-1 text-xl font-semibold tracking-tight text-slate-900">{value}</div>
          <div className={`mt-auto truncate pt-0.5 text-[11px] ${toneClass}`}>{sub ?? '\u00a0'}</div>
        </div>
        {spark && spark.length > 0 && (
          <div className="flex w-20 shrink-0 items-center border-l border-slate-100 pl-3">
            <div className="w-full">
              <Sparkline data={spark} colour={colour} height={40} formatValue={formatValue} />
            </div>
          </div>
        )}
      </div>
    </Card>
  );
}

export function DashboardPage() {
  const { t } = useTranslation();
  const [rangeKey, setRangeKey] = useState('90');
  const [stationId, setStationId] = useState('');
  const [marketRange, setMarketRange] = useState('3mo');

  const range = RANGES.find((r) => r.key === rangeKey) ?? RANGES[1];
  const from = range.days ? isoDaysAgo(range.days) : '2000-01-01';

  const { data, isLoading, isFetching, refetch } = useQuery({
    queryKey: ['dashboard', 'overview', from, stationId],
    queryFn: async () => {
      const qs = new URLSearchParams({ from });
      if (stationId) qs.set('stationId', stationId);
      return (await api.get(`/dashboard/overview?${qs}`)).data;
    },
  });

  // The market has its own timeframe, independent of the business period.
  const { data: marketData, isFetching: marketFetching } = useQuery({
    queryKey: ['market', 'coffee', marketRange],
    queryFn: async () => (await api.get(`/market/coffee?range=${marketRange}`)).data,
  });

  const { data: stations } = useQuery({
    queryKey: ['stations', 'list'],
    queryFn: async () => (await api.get('/stations')).data,
  });

  // The market endpoint returns `latest` as a point object and `points` as the
  // series; the card wants a flat price. Normalise once, and leave it null
  // while loading so the card shows a placeholder rather than $NaN.
  const market = useMemo(() => {
    if (!marketData) return null;
    const latest = marketData.latest;
    const price = latest ? Number(latest.c ?? latest) : null;
    if (price == null || !Number.isFinite(price)) return null;
    return {
      price,
      points: marketData.points ?? [],
      changePct: Number.isFinite(Number(marketData.rangeChangePct)) ? Number(marketData.rangeChangePct) : null,
      source: marketData.source ?? 'yahoo',
      stale: !!marketData.stale,
    };
  }, [marketData]);

  const trendRows = useMemo(() => {
    const tr = data?.trends;
    if (!tr) return [];
    return tr.days.map((day: string, i: number) => ({
      day,
      cherryKg: tr.cherryKg[i] ?? 0,
      greenKg: tr.greenKg[i] ?? 0,
      expenses: tr.expenses[i] ?? 0,
      purchaseCost: tr.purchaseCost?.[i] ?? 0,
      revenue: tr.revenue[i] ?? 0,
      inventoryKg: tr.inventoryKg[i] ?? 0,
      profit: tr.profit?.[i] ?? 0,
    }));
  }, [data]);

  const spark = (key: string) => trendRows.map((r: any) => ({ value: r[key] }));

  if (isLoading || !data) {
    return (
      <div className="p-6">
        <PageHeader title={t('dashboard.title')} subtitle="Ancient Halo Coffee Export" />
        <div className="grid h-64 place-items-center text-sm text-slate-400">Loading dashboard…</div>
      </div>
    );
  }

  const s = data.summary;
  const money = (v: number | null | undefined) => (v == null ? '—' : formatMoney(v, 'ETB'));
  const marketRangeLabel = MARKET_RANGES.find((r) => r.key === marketRange)?.full ?? '3 months';

  const stationColumns = [
    { key: 'name', header: 'Station', primary: true },
    { key: 'cherryKg', header: 'Cherry', render: (r: any) => formatKg(r.cherryKg) },
    { key: 'greenKg', header: 'Green', render: (r: any) => formatKg(r.greenKg) },
    {
      key: 'yieldPct',
      header: 'Yield',
      render: (r: any) => (r.yieldPct == null ? '—' : `${r.yieldPct.toFixed(1)}%`),
      renderClass: (r: any) =>
        r.yieldPct != null && (r.yieldPct < 18 || r.yieldPct > 22) ? 'text-amber-700 font-medium' : '',
    },
    { key: 'purchaseCost', header: 'Cost', render: (r: any) => money(r.purchaseCost) },
    { key: 'expenses', header: 'Expenses', render: (r: any) => money(r.expenses) },
    {
      key: 'costPerKgGreen',
      header: 'Cost/kg',
      render: (r: any) => (r.costPerKgGreen == null ? '—' : money(r.costPerKgGreen)),
      hideOnMobile: true,
    },
  ];

  const exportStations = () =>
    exportRows(
      `madda-station-performance-${data.filters.from}-to-${data.filters.to}.csv`,
      data.stationPerformance.map((r: any) => ({
        Station: r.name,
        Code: r.code,
        'Cherry kg': r.cherryKg.toFixed(2),
        'Green kg': r.greenKg.toFixed(2),
        'Yield %': r.yieldPct == null ? '' : r.yieldPct.toFixed(2),
        'Purchase cost ETB': r.purchaseCost.toFixed(2),
        'Expenses ETB': r.expenses.toFixed(2),
        'Cost per kg green ETB': r.costPerKgGreen == null ? '' : r.costPerKgGreen.toFixed(2),
      })),
    );

  return (
    <div>
      <div className="no-print">
        <PageHeader
          title={t('dashboard.title')}
          subtitle="Ancient Halo Coffee Export"
          action={
            <div className="flex gap-2">
              <button onClick={printPage} className="btn-ghost h-9 px-3 text-xs">
                <Printer size={14} /> {t('dashboard.print')}
              </button>
              <button onClick={exportStations} className="btn-ghost h-9 px-3 text-xs">
                <Download size={14} /> {t('dashboard.exportCsv')}
              </button>
            </div>
          }
        />
      </div>

      <div className="hidden print:block">
        <h1 className="text-lg font-semibold text-slate-900">Ancient Halo Coffee Export — Dashboard</h1>
        <p className="mb-4 text-xs text-slate-500">
          {data.filters.from} to {data.filters.to}
          {data.filters.stationName ? ` · ${data.filters.stationName}` : ' · all stations'}
        </p>
      </div>

      {/* ── filters ───────────────────────────────────────────────────── */}
      <Card className="no-print mb-4 p-3">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-3">
          <div className="flex items-center gap-2">
            <span className="text-[11px] font-medium uppercase tracking-wide text-slate-400">Period</span>
            <div className="flex gap-0.5 rounded-lg bg-slate-100 p-0.5">
              {RANGES.map((r) => (
                <button
                  key={r.key}
                  onClick={() => setRangeKey(r.key)}
                  title={r.full}
                  className={`rounded-md px-3 py-1.5 text-xs font-medium transition ${
                    rangeKey === r.key
                      ? 'bg-white text-brand-800 shadow-sm'
                      : 'text-slate-500 hover:text-slate-800'
                  }`}
                >
                  {r.label}
                </button>
              ))}
            </div>
          </div>

          <span className="hidden h-6 w-px bg-slate-200 sm:block" />

          <div className="flex items-center gap-2">
            <span className="text-[11px] font-medium uppercase tracking-wide text-slate-400">Station</span>
            <select
              value={stationId}
              onChange={(e) => setStationId(e.target.value)}
              className="h-8 rounded-lg border border-slate-200 bg-white px-2.5 text-xs text-slate-700 focus:border-brand-400 focus:ring-2 focus:ring-brand-100"
            >
              <option value="">All stations</option>
              {(stations ?? []).map((st: any) => (
                <option key={st.id} value={st.id}>
                  {st.name}
                </option>
              ))}
            </select>
            {stationId && (
              <button
                onClick={() => setStationId('')}
                className="text-[11px] text-slate-400 underline hover:text-slate-600"
              >
                clear
              </button>
            )}
          </div>

          <div className="ml-auto flex items-center gap-3">
            <span className="text-[11px] text-slate-400">
              {range.full} · {data.filters.from} → {data.filters.to}
            </span>
            <button
              onClick={() => refetch()}
              className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100"
              title="Refresh"
            >
              <RefreshCw size={14} className={isFetching ? 'animate-spin' : ''} />
            </button>
          </div>
        </div>
      </Card>

      {data.stationScoped && (
        <p className="no-print -mt-2 mb-3 text-[11px] text-slate-400">{t('dashboard.stationScopeNote')}</p>
      )}

      {/* ── cards ─────────────────────────────────────────────────────── */}
      <div className="grid gap-3 sm:gap-4 lg:grid-cols-4">
        {/* Market: two rows tall, with its own timeframe. */}
        <Card className="print-keep-colour flex flex-col border-brand-700 bg-brand-700 p-5 text-white lg:row-span-2">
          <div className="flex items-start justify-between gap-2">
            <div>
              <div className="text-xs font-medium uppercase tracking-wide text-brand-200">
                {t('dashboard.market')}
              </div>
              <div className="text-[11px] text-brand-300">{t('dashboard.marketSubtitle')}</div>
            </div>
            <Activity size={16} className="shrink-0 text-brand-300" />
          </div>

          {/* Timeframe control lives on the card so it can differ from the page. */}
          <div className="no-print mt-2.5 flex gap-0.5 rounded-lg bg-brand-800/60 p-0.5">
            {MARKET_RANGES.map((r) => (
              <button
                key={r.key}
                onClick={() => setMarketRange(r.key)}
                className={`flex-1 rounded-md px-2 py-1 text-[11px] font-medium transition ${
                  marketRange === r.key ? 'bg-brand-50 text-brand-800' : 'text-brand-200 hover:text-white'
                }`}
              >
                {r.label}
              </button>
            ))}
          </div>
          <div className="mt-1.5 flex items-center gap-1.5 text-[10px] text-brand-300">
            <span>Change over {marketRangeLabel}</span>
            <span className="text-brand-500">·</span>
            <span>ICE Arabica Coffee C, front month</span>
          </div>

          {market ? (
            <>
              <div className="mt-2.5 flex items-end gap-2">
                <span className="text-4xl font-semibold tracking-tight">
                  ${market.price?.toFixed(2) ?? '—'}
                </span>
                <span className="pb-1 text-sm text-brand-200">{t('dashboard.perKg')}</span>
              </div>

              <div className="mt-1 flex items-center gap-1.5 text-xs">
                {(market.changePct ?? 0) >= 0 ? (
                  <TrendingUp size={13} className="text-emerald-300" />
                ) : (
                  <TrendingDown size={13} className="text-rose-300" />
                )}
                <span className={(market.changePct ?? 0) >= 0 ? 'text-emerald-300' : 'text-rose-300'}>
                  {market.changePct == null ? '—' : `${market.changePct >= 0 ? '+' : ''}${market.changePct.toFixed(2)}%`}
                </span>
                <span className="text-brand-300">over {marketRangeLabel}</span>
              </div>

              <div className="mt-2.5">
                <Sparkline
                  data={(market.points ?? []).map((p: any) => ({ value: p.c }))}
                  colour="#dfae79"
                  height={44}
                  formatValue={(v) => `$${v.toFixed(3)}/kg`}
                />
              </div>

              <div className="mt-auto pt-3">
                {s.avgSalePricePerKg != null && market.price != null && (
                  <div className="flex items-baseline justify-between border-t border-brand-600 pt-2.5">
                    <span className="text-[11px] text-brand-200">{t('dashboard.vsOurPrice')}</span>
                    <span
                      className={`text-sm font-semibold ${
                        s.avgSalePricePerKg >= market.price ? 'text-emerald-300' : 'text-rose-300'
                      }`}
                    >
                      {s.avgSalePricePerKg >= market.price ? '+' : ''}$
                      {(s.avgSalePricePerKg - market.price).toFixed(2)}/kg
                    </span>
                  </div>
                )}
                <div className="mt-1 flex items-center gap-1.5 text-[10px] text-brand-300">
                  {marketFetching && <RefreshCw size={9} className="animate-spin" />}
                  {market.stale ? 'cached' : market.source} · indicative benchmark
                </div>
              </div>
            </>
          ) : (
            <div className="mt-4 text-xs text-brand-200">
              Market feed unavailable. The rest of the dashboard is unaffected.
            </div>
          )}
        </Card>

        {/* Supply: a trend matters for all three. */}
        <KpiCard
          label={t('dashboard.cherryPurchased')}
          value={formatKg(s.cherryPurchasedKg)}
          sub={`${money(s.avgPurchasePricePerKg)} ${t('dashboard.perKg')}`}
          spark={spark('cherryKg')}
          colour="#4c6b46"
          icon={<Coffee size={18} />}
        />
        <KpiCard
          label={t('dashboard.greenOutput')}
          value={formatKg(s.greenOutputKg)}
          sub={s.yieldPct != null ? `${t('dashboard.yield')} ${s.yieldPct.toFixed(1)}%` : undefined}
          subTone={s.yieldPct != null && (s.yieldPct < 18 || s.yieldPct > 22) ? 'down' : 'up'}
          spark={spark('greenKg')}
          colour="#6f8f68"
          icon={<Leaf size={18} />}
        />
        <KpiCard
          label={t('dashboard.inventory')}
          value={formatKg(s.inventoryKg)}
          sub={s.costPerKgGreen != null ? `${money(s.costPerKgGreen)} ${t('dashboard.perKg')}` : undefined}
          spark={spark('inventoryKg')}
          colour="#9fb699"
          icon={<Package size={18} />}
        />

        {/* Commercial: revenue and profit move, so they carry a trend. */}
        <KpiCard
          label={t('dashboard.salesRevenue')}
          value={money(s.salesRevenue)}
          sub={s.avgSalePricePerKg != null ? `${t('dashboard.avgSalePrice')} $${s.avgSalePricePerKg.toFixed(2)}/kg` : undefined}
          spark={spark('revenue')}
          colour="#35502f"
          icon={<Wallet size={18} />}
        />
        <KpiCard
          label={t('dashboard.grossProfit')}
          value={money(s.grossProfit)}
          sub={s.marginPct != null ? `${t('dashboard.margin')} ${s.marginPct.toFixed(1)}%` : undefined}
          subTone={s.grossProfit >= 0 ? 'up' : 'down'}
          spark={spark('profit')}
          colour="#ad7846"
          icon={s.grossProfit >= 0 ? <TrendingUp size={18} /> : <TrendingDown size={18} />}
        />
        {/* Purchase cost is a large recurring outflow, so its shape is worth showing. */}
        <KpiCard
          label={t('dashboard.purchaseCost')}
          value={money(s.purchaseCost)}
          sub={`${formatKg(s.cherryPurchasedKg)} cherry`}
          spark={spark('purchaseCost')}
          colour="#c08a5a"
          icon={<Receipt size={18} />}
        />

        {/* Derived measures: a single ratio has no meaningful daily shape, so no
            sparkline. A flat line would imply a stability that is not measured. */}
        <KpiCard
          label={t('dashboard.yield')}
          value={s.yieldPct != null ? `${s.yieldPct.toFixed(1)}%` : '—'}
          sub="expected 18–22% for green coffee"
          subTone={s.yieldPct != null && (s.yieldPct < 18 || s.yieldPct > 22) ? 'down' : 'muted'}
          colour="#6f8f68"
          icon={<Percent size={18} />}
        />
        <KpiCard
          label={t('dashboard.activeStations')}
          value={String(s.activeStations)}
          sub={`${data.stationPerformance.length} reporting activity`}
          colour="#4c6b46"
          icon={<Warehouse size={18} />}
        />
        <KpiCard
          label="Daily expense rate"
          value={range.days ? money(s.stationExpenses / range.days) : money(s.stationExpenses)}
          sub={`${t('dashboard.stationExpenses')}: ${money(s.stationExpenses)}`}
          colour="#d09455"
          icon={<Receipt size={18} />}
        />
        <KpiCard
          label={t('dashboard.topBuyers')}
          value={String(data.topBuyers.length)}
          sub={data.topBuyers[0] ? `${data.topBuyers[0].name} leads` : 'no sales yet'}
          colour="#8f5f38"
          icon={<Users size={18} />}
        />
      </div>

      {/* ── breakdowns and tables ─────────────────────────────────────── */}
      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <Card className="p-5">
          <h3 className="mb-4 text-sm font-semibold text-slate-700">{t('dashboard.greenByProcess')}</h3>
          <div className="h-56">
            {data.greenByProcess.length ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={data.greenByProcess} margin={{ top: 4, right: 8, bottom: 0, left: -12 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#eef1ee" vertical={false} />
                  <XAxis dataKey="process" tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 10, fill: '#94a3b8' }} axisLine={false} tickLine={false} width={48} />
                  <Tooltip formatter={(v: any) => formatKg(Number(v))} contentStyle={{ fontSize: 12, borderRadius: 8 }} />
                  <Bar dataKey="greenKg" name="Green" fill="#2a3f26" radius={[6, 6, 0, 0]} isAnimationActive={false} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="grid h-full place-items-center text-xs text-slate-400">{t('dashboard.noData')}</div>
            )}
          </div>
        </Card>

        <Card className="lg:col-span-2">
          <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
            <h3 className="text-sm font-semibold text-slate-700">{t('dashboard.stationPerformance')}</h3>
            <button onClick={exportStations} className="no-print btn-ghost h-8 px-2.5 text-xs">
              <Download size={13} /> CSV
            </button>
          </div>
          <DataTable columns={stationColumns as any} rows={data.stationPerformance} />
        </Card>
      </div>

      <Card className="mt-4 p-5">
        <h3 className="mb-3 text-sm font-semibold text-slate-700">{t('dashboard.topBuyers')}</h3>
        {data.topBuyers.length ? (
          <div className="grid gap-x-8 gap-y-3 sm:grid-cols-2">
            {data.topBuyers.map((b: any, i: number) => {
              const share = s.salesRevenueUsd > 0 ? b.amount / s.salesRevenueUsd : 0;
              return (
                <div key={b.name + i}>
                  <div className="flex items-baseline justify-between text-xs">
                    <span className="truncate font-medium text-slate-700">{b.name}</span>
                    <span className="ml-2 shrink-0 text-slate-500">{formatMoney(b.amount, 'USD')}</span>
                  </div>
                  <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-slate-100">
                    <div
                      className="h-full rounded-full bg-copper-500"
                      style={{ width: `${Math.max(2, Math.round(share * 100))}%` }}
                    />
                  </div>
                  <div className="mt-0.5 text-[10px] text-slate-400">
                    {b.country ?? '—'} · {formatKg(b.kg)} · {b.invoices} invoice{b.invoices === 1 ? '' : 's'} ·{' '}
                    {(share * 100).toFixed(0)}% of revenue
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="grid h-24 place-items-center text-xs text-slate-400">{t('dashboard.noData')}</div>
        )}
      </Card>
    </div>
  );
}
