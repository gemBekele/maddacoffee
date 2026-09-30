import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { PageHeader } from '@/components/PageHeader';
import { Card, StatCard } from '@/components/ui';
import { DataTable } from '@/components/DataTable';
import { useList } from '@/lib/queries';
import { formatKg, formatMoney } from '@madda/shared';

const TABS = ['purchases', 'processing', 'inventory', 'sales', 'aging'] as const;
type Tab = (typeof TABS)[number];

export function ReportsPage() {
  const { t } = useTranslation();
  const [tab, setTab] = useState<Tab>('purchases');
  return (
    <div>
      <PageHeader title={t('nav.reports')} />
      <div className="mb-4 flex flex-wrap gap-2">
        {TABS.map((x) => (
          <button
            key={x}
            onClick={() => setTab(x)}
            className={`rounded-full px-4 py-1.5 text-sm font-medium capitalize ${
              tab === x ? 'bg-brand-700 text-white' : 'bg-white text-slate-600 ring-1 ring-slate-200'
            }`}
          >
            {x}
          </button>
        ))}
      </div>
      {tab === 'purchases' && <Purchases />}
      {tab === 'processing' && <Processing />}
      {tab === 'inventory' && <Inventory />}
      {tab === 'sales' && <Sales />}
      {tab === 'aging' && <Aging />}
    </div>
  );
}

function Purchases() {
  const { data, isLoading } = useList<any[]>(['report', 'purchases'], '/reports/purchases');
  const columns = [
    { key: 'code', header: 'Code', primary: true },
    { key: 'date', header: 'Date', render: (r: any) => new Date(r.date).toLocaleDateString() },
    { key: 'supplier', header: 'Supplier' },
    { key: 'station', header: 'Station', hideOnMobile: true },
    { key: 'cherryKg', header: 'Cherry KG', render: (r: any) => formatKg(r.cherryKg) },
    { key: 'total', header: 'Total', render: (r: any) => formatMoney(r.total, r.currency) },
  ];
  return <Card><DataTable columns={columns} rows={data ?? []} loading={isLoading} /></Card>;
}

function Processing() {
  const { data, isLoading } = useList<any[]>(['report', 'processing'], '/reports/processing');
  const columns = [
    { key: 'code', header: 'Batch', primary: true, render: (r: any) => <div><div className="font-medium">{r.code}</div><div className="text-xs text-slate-400">{r.lotId}</div></div> },
    { key: 'process', header: 'Process' },
    { key: 'cherryIn', header: 'Cherry In', render: (r: any) => formatKg(r.cherryIn) },
    { key: 'greenOut', header: 'Green Out', render: (r: any) => formatKg(r.greenOut) },
    { key: 'yieldPct', header: 'Yield', render: (r: any) => (r.yieldPct ? `${r.yieldPct}%` : '—') },
  ];
  return <Card><DataTable columns={columns} rows={data ?? []} loading={isLoading} /></Card>;
}

function Inventory() {
  const { data, isLoading } = useList<any>(['report', 'inventory'], '/reports/inventory-valuation');
  const columns = [
    { key: 'lotId', header: 'Lot', primary: true },
    { key: 'process', header: 'Process' },
    { key: 'grade', header: 'Grade', hideOnMobile: true },
    { key: 'quantityKg', header: 'Qty', render: (r: any) => formatKg(r.quantityKg) },
    { key: 'value', header: 'Value', render: (r: any) => formatMoney(r.value, r.currency) },
  ];
  return (
    <div>
      <div className="mb-4 grid grid-cols-2 gap-4">
        <StatCard label="Total inventory" value={formatKg(data?.totalKg ?? 0)} />
        <StatCard label="Total value" value={formatMoney(data?.totalValue ?? 0, 'ETB')} />
      </div>
      <Card><DataTable columns={columns} rows={data?.rows ?? []} loading={isLoading} /></Card>
    </div>
  );
}

function Sales() {
  const { data, isLoading } = useList<any[]>(['report', 'sales'], '/reports/sales');
  const columns = [
    { key: 'code', header: 'Invoice', primary: true },
    { key: 'date', header: 'Date', render: (r: any) => new Date(r.date).toLocaleDateString() },
    { key: 'buyer', header: 'Buyer' },
    { key: 'quantityKg', header: 'Qty', render: (r: any) => formatKg(r.quantityKg) },
    { key: 'value', header: 'Value', render: (r: any) => formatMoney(r.value, r.currency) },
  ];
  return <Card><DataTable columns={columns} rows={data ?? []} loading={isLoading} /></Card>;
}

function Aging() {
  const { data, isLoading } = useList<any>(['report', 'aging'], '/reports/aging');
  if (isLoading) return <Card className="p-8 text-center text-sm text-slate-400">Loading…</Card>;
  const payables = data?.payables ?? [];
  const receivables = data?.receivables ?? [];
  const cols = [
    { key: 'ref', header: 'Ref', primary: true },
    { key: 'party', header: 'Party' },
    { key: 'bucket', header: 'Age', render: (r: any) => r.bucket },
    { key: 'amount', header: 'Amount', render: (r: any) => formatMoney(r.amount, r.currency) },
  ];
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card><div className="border-b border-slate-100 px-5 py-3 text-sm font-semibold text-slate-700">Payables (AP)</div><DataTable columns={cols} rows={payables} /></Card>
      <Card><div className="border-b border-slate-100 px-5 py-3 text-sm font-semibold text-slate-700">Receivables (AR)</div><DataTable columns={cols} rows={receivables} /></Card>
    </div>
  );
}
