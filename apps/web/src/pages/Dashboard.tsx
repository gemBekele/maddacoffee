import { useTranslation } from 'react-i18next';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
} from 'recharts';
import { Coffee, Leaf, Package, Warehouse } from 'lucide-react';
import { PageHeader } from '@/components/PageHeader';
import { Card, StatCard, StatusPill } from '@/components/ui';
import { DataTable } from '@/components/DataTable';
import { useList } from '@/lib/queries';
import { formatKg, formatMoney } from '@madda/shared';

const PIE_COLORS = ['#2a3f26', '#c08a5a', '#4c6b46', '#ad7846', '#6f8f68', '#dfae79', '#9fb699'];

export function DashboardPage() {
  const { t } = useTranslation();
  const { data: summary } = useList<any>(['dashboard', 'summary'], '/dashboard/summary');
  const { data: pending } = useList<any>(['dashboard', 'pending'], '/dashboard/pending');
  const { data: expenses } = useList<any[]>(['dashboard', 'expense-cat'], '/dashboard/expense-by-category');
  const { data: processes } = useList<any[]>(['dashboard', 'green-process'], '/dashboard/green-by-process');
  const { data: stations } = useList<any[]>(['dashboard', 'station-perf'], '/dashboard/station-performance');

  const columns = [
    { key: 'name', header: 'Station', primary: true },
    { key: 'cherryKg', header: 'Cherry KG', render: (r: any) => formatKg(r.cherryKg) },
    { key: 'greenKg', header: 'Green KG', render: (r: any) => formatKg(r.greenKg) },
    { key: 'purchaseCost', header: 'Cost', render: (r: any) => formatMoney(r.purchaseCost, 'ETB') },
    { key: 'expenses', header: 'Expenses', render: (r: any) => formatMoney(r.expenses, 'ETB') },
  ];

  return (
    <div>
      <PageHeader title={t('dashboard.title')} subtitle="Ancient Halo Coffee Export" />

      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <StatCard label={t('dashboard.activeStations')} value={summary?.activeStations ?? '—'} icon={<Warehouse size={18} />} />
        <StatCard label={t('dashboard.cherryPurchased')} value={summary ? formatKg(summary.cherryPurchasedKg) : '—'} icon={<Coffee size={18} />} />
        <StatCard label={t('dashboard.greenOutput')} value={summary ? formatKg(summary.greenOutputKg) : '—'} icon={<Leaf size={18} />} />
        <StatCard label={t('dashboard.inventory')} value={summary ? formatKg(summary.inventoryKg) : '—'} icon={<Package size={18} />} />
        <StatCard label={t('dashboard.purchaseCost')} value={summary ? formatMoney(summary.purchaseCost, 'ETB') : '—'} />
        <StatCard label={t('dashboard.stationExpenses')} value={summary ? formatMoney(summary.stationExpenses, 'ETB') : '—'} />
        <StatCard label={t('dashboard.salesRevenue')} value={summary ? formatMoney(summary.salesRevenue, 'ETB') : '—'} />
        <StatCard label={t('dashboard.grossProfit')} value={summary ? formatMoney(summary.grossProfit, 'ETB') : '—'} />
      </div>

      {pending && (
        <div className="mt-4 flex flex-wrap gap-2">
          <StatusPill status={`Pending payments: ${pending.payments}`} />
          <StatusPill status={`Pending expenses: ${pending.expenses}`} />
          <StatusPill status={`Active lots: ${pending.activeLots}`} />
          <StatusPill status={`Completed batches: ${pending.completedBatches}`} />
        </div>
      )}

      <div className="mt-5 grid gap-4 lg:grid-cols-2">
        <Card className="p-5">
          <h3 className="mb-4 text-sm font-semibold text-slate-700">{t('dashboard.expenseByCategory')}</h3>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={expenses ?? []} dataKey="amount" nameKey="category" innerRadius={50} outerRadius={90} paddingAngle={2}>
                  {(expenses ?? []).map((_, i) => (
                    <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <Card className="p-5">
          <h3 className="mb-4 text-sm font-semibold text-slate-700">{t('dashboard.greenByProcess')}</h3>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={processes ?? []}>
                <XAxis dataKey="process" tick={{ fontSize: 12 }} />
                <YAxis tick={{ fontSize: 12 }} />
                <Tooltip />
                <Bar dataKey="greenKg" fill="#2a3f26" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>
      </div>

      <Card className="mt-5">
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
          <h3 className="text-sm font-semibold text-slate-700">{t('dashboard.stationPerformance')}</h3>
        </div>
        <DataTable columns={columns} rows={stations ?? []} />
      </Card>
    </div>
  );
}
