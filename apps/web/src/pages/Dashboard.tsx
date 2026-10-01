import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import {
  AreaChart,
  Area,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  CartesianGrid,
  Legend,
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
} from 'lucide-react';
import { PageHeader } from '@/components/PageHeader';
import { Card, StatusPill } from '@/components/ui';
import { Sparkline } from '@/components/Sparkline';
import { DataTable } from '@/components/DataTable';
import { api } from '@/lib/api';
import { exportRows, printPage } from '@/lib/export';
import { formatKg, formatMoney } from '@madda/shared';

const PIE_COLORS = ['#2a3f26', '#c08a5a', '#4c6b46', '#ad7846', '#6f8f68', '#dfae79', '#9fb699', '#8f5f38', '#35502f'];

const RANGES = [
  { key: '30', label: '30D', days: 30 },
  { key: '90', label: '90D', days: 90 },
  { key: '180', label: '6M', days: 180 },
  { key: '365', label: '12M', days: 365 },
  { key: 'all', label: 'All', days: null },
];

function isoDaysAgo(days: number) {
  const d = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  return d.toISOString().slice(0, 10);
}

/** A KPI card: headline figure, a supporting line, and a trend line. */
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
    <Card className="flex flex-col p-4">
      <div className="flex items-start justify-between gap-2">
        <span className="text-xs font-medium text-slate-500">{label}</span>
        {icon && <span className="text-slate-300">{icon}</span>}
      </div>
      <div className="mt-1.5 text-xl font-semibold tracking-tight text-slate-900">{value}</div>
      <div className={`mt-0.5 truncate text-[11px] ${toneClass}`}>{sub ?? '\u00a0'}</div>
      <div className="mt-auto pt-2.5">
        <Sparkline data={spark ?? []} colour={colour} formatValue={formatValue} />
      </div>
    </Card>
  );
}

export function DashboardPage() {
  const { t } = useTranslation();
  const [rangeKey, setRangeKey] = useState('90');
  const [stationId, setStationId] = useState('');

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

  const { data: profiles } = useQuery({
    queryKey: ['stations', 'list'],
    queryFn: async () => (await api.get('/stations')).data,
  });

  // Turn the parallel daily series into row objects for recharts.
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
  const market = data.market;
  const money = (v: number | null | undefined) => (v == null ? '—' : formatMoney(v, 'ETB'));

  const stationColumns = [
    { key: 'name', header: 'Station', primary: true },
    { key: 'cherryKg', header: 'Cherry', render: (r: any) => formatKg(r.cherryKg) },
    { key: 'greenKg', header: 'Green', render: (r: any) => formatKg(r.greenKg) },
    {
      key: 'yieldPct',
      header: 'Yield',
      render: (r: any) => (r.yieldPct == null ? '—' : `${r.yieldPct.toFixed(1)}%`),
      // Colour the outlier rather than every cell: a yield far off the 18-22%
      // band is the thing worth noticing.
      renderClass: (r: any) =>
        r.yieldPct != null && (r.yieldPct < 15 || r.yieldPct > 26) ? 'text-amber-700 font-medium' : '',
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

  const exportTrend = () =>
    exportRows(
      `madda-daily-trend-${data.filters.from}-to-${data.filters.to}.csv`,
      trendRows.map((r: any) => ({
        Date: r.day,
        'Cherry kg': r.cherryKg.toFixed(2),
        'Green kg': r.greenKg.toFixed(2),
        'Expenses ETB': r.expenses.toFixed(2),
        'Revenue ETB': r.revenue.toFixed(2),
        'Inventory kg': r.inventoryKg.toFixed(2),
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

      {/* Print-only heading: a printed dashboard needs to say what it is. */}
      <div className="hidden print:block">
        <h1 className="text-lg font-semibold text-slate-900">Ancient Halo Coffee Export — Dashboard</h1>
        <p className="mb-4 text-xs text-slate-500">
          {data.filters.from} to {data.filters.to}
          {data.filters.stationName ? ` · ${data.filters.stationName}` : ' · all stations'}
        </p>
      </div>

      {/* ── filters ───────────────────────────────────────────────────── */}
      <div className="no-print mb-4 flex flex-wrap items-center gap-2">
        <div className="flex gap-0.5 rounded-lg bg-slate-100 p-0.5">
          {RANGES.map((r) => (
            <button
              key={r.key}
              onClick={() => setRangeKey(r.key)}
              className={`rounded-md px-2.5 py-1 text-xs font-medium transition ${
                rangeKey === r.key ? 'bg-white text-brand-800 shadow-sm' : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              {r.label}
            </button>
          ))}
        </div>

        <select
          value={stationId}
          onChange={(e) => setStationId(e.target.value)}
          className="h-8 rounded-lg border border-slate-200 bg-white px-2.5 text-xs text-slate-700"
        >
          <option value="">{t('dashboard.allStations')}</option>
          {(profiles ?? []).map((st: any) => (
            <option key={st.id} value={st.id}>
              {st.name}
            </option>
          ))}
        </select>

        <span className="text-xs text-slate-400">
          {data.filters.from} → {data.filters.to}
        </span>

        <button
          onClick={() => refetch()}
          className="ml-auto rounded-lg p-1.5 text-slate-400 hover:bg-slate-100"
          title="Refresh"
        >
          <RefreshCw size={14} className={isFetching ? 'animate-spin' : ''} />
        </button>
      </div>

      {data.stationScoped && (
        <p className="no-print mb-3 text-[11px] text-slate-400">{t('dashboard.stationScopeNote')}</p>
      )}

      {/* ── cards ─────────────────────────────────────────────────────── */}
      <div className="grid gap-3 sm:gap-4 lg:grid-cols-4">
        {/* Market: two rows tall, so it reads as the headline figure. */}
        <Card className="print-keep-colour flex flex-col border-brand-700 bg-brand-700 p-5 text-white lg:row-span-2">
          <div className="flex items-start justify-between">
            <div>
              <div className="text-xs font-medium uppercase tracking-wide text-brand-200">
                {t('dashboard.market')}
              </div>
              <div className="text-[11px] text-brand-300">{t('dashboard.marketSubtitle')}</div>
            </div>
            <Activity size={16} className="text-brand-300" />
          </div>

          {market ? (
            <>
              <div className="mt-3 flex items-end gap-2">
                <span className="text-4xl font-semibold tracking-tight">
                  ${market.price?.toFixed(2) ?? '—'}
                </span>
                <span className="pb-1 text-sm text-brand-200">{t('dashboard.perKg')}</span>
              </div>

              <div className="mt-1 flex items-center gap-1.5 text-xs">
                {market.changePct >= 0 ? (
                  <TrendingUp size={13} className="text-emerald-300" />
                ) : (
                  <TrendingDown size={13} className="text-rose-300" />
                )}
                <span className={market.changePct >= 0 ? 'text-emerald-300' : 'text-rose-300'}>
                  {market.changePct >= 0 ? '+' : ''}
                  {market.changePct?.toFixed(2)}%
                </span>
                <span className="text-brand-300">this period</span>
              </div>

              <div className="mt-3">
                <Sparkline
                  data={market.spark.map((p: any) => ({ value: p.c }))}
                  colour="#dfae79"
                  height={44}
                  formatValue={(v) => `$${v.toFixed(3)}/kg`}
                />
              </div>

              <div className="mt-auto pt-3">
                {s.avgSalePricePerKg != null && (
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
                <div className="mt-1 text-[10px] text-brand-300">
                  {market.stale ? 'cached' : market.source} · benchmark, indicative
                </div>
              </div>
            </>
          ) : (
            <div className="mt-4 text-xs text-brand-200">
              Market feed unavailable. The rest of the dashboard is unaffected.
            </div>
          )}
        </Card>

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

        <KpiCard
          label={t('dashboard.salesRevenue')}
          value={money(s.salesRevenue)}
          sub={s.avgSalePricePerKg != null ? `${t('dashboard.avgSalePrice')} $${s.avgSalePricePerKg.toFixed(2)}/kg` : undefined}
          spark={spark('revenue')}
          colour="#35502f"
          icon={<Wallet size={18} />}
        />
        <KpiCard
          label={t('dashboard.purchaseCost')}
          value={money(s.purchaseCost)}
          sub={`${formatKg(s.cherryPurchasedKg)} cherry`}
          spark={spark('purchaseCost')}
          colour="#c08a5a"
          icon={<Receipt size={18} />}
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

        <KpiCard
          label={t('dashboard.stationExpenses')}
          value={money(s.stationExpenses)}
          sub={`${data.expenseByCategory.length} categories`}
          spark={spark('expenses')}
          colour="#d09455"
          icon={<Receipt size={18} />}
        />
        <KpiCard
          label={t('dashboard.yield')}
          value={s.yieldPct != null ? `${s.yieldPct.toFixed(1)}%` : '—'}
          sub="expected 18–22% for green coffee"
          subTone={s.yieldPct != null && (s.yieldPct < 18 || s.yieldPct > 22) ? 'down' : 'muted'}
          spark={spark('greenKg')}
          colour="#6f8f68"
          icon={<Percent size={18} />}
        />
        <KpiCard
          label={t('dashboard.activeStations')}
          value={String(s.activeStations)}
          sub={`${data.stationPerformance.length} reporting activity`}
          spark={spark('cherryKg')}
          colour="#4c6b46"
          icon={<Warehouse size={18} />}
        />
        <KpiCard
          label={t('dashboard.topBuyers')}
          value={String(data.topBuyers.length)}
          sub={data.topBuyers[0] ? `${data.topBuyers[0].name} leads` : 'no sales yet'}
          spark={spark('revenue')}
          colour="#8f5f38"
          icon={<Users size={18} />}
        />
      </div>

      {/* ── pending ───────────────────────────────────────────────────── */}
      <div className="mt-4 flex flex-wrap items-center gap-2">
        <StatusPill status={`Pending payments: ${data.pending.payments}`} />
        <StatusPill status={`Pending expenses: ${data.pending.expenses}`} />
        <StatusPill status={`Active lots: ${data.pending.activeLots}`} />
        <StatusPill status={`Completed batches: ${data.pending.completedBatches}`} />
      </div>

      {/* ── trends ────────────────────────────────────────────────────── */}
      <Card className="mt-5 p-5">
        <div className="mb-4 flex flex-wrap items-start justify-between gap-2">
          <div>
            <h3 className="text-sm font-semibold text-slate-700">{t('dashboard.trends')}</h3>
            <p className="text-xs text-slate-400">
              {data.filters.from} to {data.filters.to}
            </p>
          </div>
          <button onClick={exportTrend} className="no-print btn-ghost h-8 px-2.5 text-xs">
            <Download size={13} /> CSV
          </button>
        </div>
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={trendRows} margin={{ top: 4, right: 8, bottom: 0, left: -8 }}>
              <defs>
                <linearGradient id="gRev" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#2a3f26" stopOpacity={0.28} />
                  <stop offset="100%" stopColor="#2a3f26" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="gExp" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#c08a5a" stopOpacity={0.28} />
                  <stop offset="100%" stopColor="#c08a5a" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#eef1ee" vertical={false} />
              <XAxis
                dataKey="day"
                tick={{ fontSize: 10, fill: '#94a3b8' }}
                axisLine={{ stroke: '#e5e7eb' }}
                tickLine={false}
                minTickGap={40}
                tickFormatter={(d) => new Date(d).toLocaleDateString([], { day: 'numeric', month: 'short' })}
              />
              <YAxis
                tick={{ fontSize: 10, fill: '#94a3b8' }}
                axisLine={false}
                tickLine={false}
                tickFormatter={(v) => (v >= 1000 ? `${Math.round(v / 1000)}k` : String(v))}
                width={44}
              />
              <Tooltip
                formatter={(v: any, name: any) => [formatMoney(Number(v), 'ETB'), name]}
                labelFormatter={(d) => new Date(d).toLocaleDateString([], { day: 'numeric', month: 'short', year: 'numeric' })}
                contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid #e5e7eb' }}
              />
              <Legend wrapperStyle={{ fontSize: 12 }} iconType="plainline" />
              <Area
                type="monotone"
                dataKey="revenue"
                name={t('dashboard.salesRevenue')}
                stroke="#2a3f26"
                strokeWidth={2}
                fill="url(#gRev)"
                isAnimationActive={false}
              />
              <Area
                type="monotone"
                dataKey="expenses"
                name={t('dashboard.stationExpenses')}
                stroke="#c08a5a"
                strokeWidth={2}
                fill="url(#gExp)"
                isAnimationActive={false}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </Card>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Card className="p-5">
          <h3 className="mb-4 text-sm font-semibold text-slate-700">{t('dashboard.expenseByCategory')}</h3>
          <div className="h-60">
            {data.expenseByCategory.length ? (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={data.expenseByCategory}
                    dataKey="amount"
                    nameKey="category"
                    innerRadius={46}
                    outerRadius={82}
                    paddingAngle={2}
                    // Without this the sectors stay at their initial zero angle
                    // until the entry animation runs, which never happens in a
                    // headless render and looks like an empty chart.
                    isAnimationActive={false}
                  >
                    {data.expenseByCategory.map((_: any, i: number) => (
                      <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(v: any) => formatMoney(Number(v), 'ETB')} contentStyle={{ fontSize: 12, borderRadius: 8 }} />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <div className="grid h-full place-items-center text-xs text-slate-400">{t('dashboard.noData')}</div>
            )}
          </div>
        </Card>

        <Card className="p-5">
          <h3 className="mb-4 text-sm font-semibold text-slate-700">{t('dashboard.greenByProcess')}</h3>
          <div className="h-60">
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
      </div>

      {/* ── tables ────────────────────────────────────────────────────── */}
      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
            <h3 className="text-sm font-semibold text-slate-700">{t('dashboard.stationPerformance')}</h3>
            <button onClick={exportStations} className="no-print btn-ghost h-8 px-2.5 text-xs">
              <Download size={13} /> CSV
            </button>
          </div>
          <DataTable columns={stationColumns as any} rows={data.stationPerformance} />
        </Card>

        <Card className="p-5">
          <h3 className="mb-3 text-sm font-semibold text-slate-700">{t('dashboard.topBuyers')}</h3>
          {data.topBuyers.length ? (
            <div className="space-y-2.5">
              {data.topBuyers.map((b: any, i: number) => {
                const share = s.salesRevenueUsd > 0 ? b.amount / s.salesRevenueUsd : 0;
                return (
                  <div key={b.name + i}>
                    <div className="flex items-baseline justify-between text-xs">
                      <span className="truncate font-medium text-slate-700">{b.name}</span>
                      <span className="ml-2 shrink-0 text-slate-500">
                        {formatMoney(b.amount, 'USD')}
                      </span>
                    </div>
                    <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-slate-100">
                      <div
                        className="h-full rounded-full bg-copper-500"
                        style={{ width: `${Math.max(2, Math.round(share * 100))}%` }}
                      />
                    </div>
                    <div className="mt-0.5 text-[10px] text-slate-400">
                      {b.country ?? '—'} · {formatKg(b.kg)} · {b.invoices} invoice{b.invoices === 1 ? '' : 's'}
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="grid h-32 place-items-center text-xs text-slate-400">{t('dashboard.noData')}</div>
          )}
        </Card>
      </div>
    </div>
  );
}
