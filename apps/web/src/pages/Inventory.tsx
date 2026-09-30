import { useTranslation } from 'react-i18next';
import { PageHeader } from '@/components/PageHeader';
import { Card, StatusPill } from '@/components/ui';
import { DataTable } from '@/components/DataTable';
import { useList } from '@/lib/queries';
import { formatKg, formatMoney } from '@madda/shared';

export function InventoryPage() {
  const { t } = useTranslation();
  const { data: rows, isLoading } = useList<any[]>(['inventory'], '/inventory');

  const columns = [
    {
      key: 'lotId',
      header: t('inventory.lot'),
      primary: true,
      render: (r: any) => (
        <div>
          <div className="font-medium text-slate-900">{r.lotId}</div>
          <div className="text-xs text-slate-400">{r.lot?.process} · {r.lot?.grade ?? '—'}</div>
        </div>
      ),
    },
    { key: 'warehouse', header: t('inventory.warehouse'), render: (r: any) => r.warehouse ?? '—', hideOnMobile: true },
    { key: 'quantityKg', header: t('inventory.quantity'), render: (r: any) => formatKg(r.quantityKg) },
    { key: 'unitCost', header: t('inventory.unitCost'), render: (r: any) => formatMoney(r.unitCost, r.currency), hideOnMobile: true },
    {
      key: 'value',
      header: t('inventory.value'),
      render: (r: any) => formatMoney(Number(r.quantityKg) * Number(r.unitCost), r.currency),
    },
    { key: 'status', header: t('common.status'), render: (r: any) => <StatusPill status={r.status} /> },
  ];

  return (
    <div>
      <PageHeader title={t('inventory.title')} />
      <Card>
        <DataTable columns={columns} rows={rows ?? []} loading={isLoading} />
      </Card>
    </div>
  );
}
