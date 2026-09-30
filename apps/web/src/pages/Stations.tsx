import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Plus } from 'lucide-react';
import { PageHeader } from '@/components/PageHeader';
import { Button, Card, Field, Input, Modal, Select, StatusPill } from '@/components/ui';
import { DataTable } from '@/components/DataTable';
import { useList, useOfflineSave } from '@/lib/queries';
import { useAuth } from '@/lib/auth';

export function StationsPage() {
  const { t } = useTranslation();
  const { can } = useAuth();
  const [open, setOpen] = useState(false);
  const { data: rows, isLoading } = useList<any[]>(['stations'], '/stations');
  const save = useOfflineSave([['stations']], { url: '/stations' });
  const [form, setForm] = useState<any>({ name: '', region: '', zone: '', location: '', manager: '', capacityTons: '', status: 'Active' });

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    await save.mutateAsync({ ...form, capacityTons: form.capacityTons ? Number(form.capacityTons) : undefined });
    setOpen(false);
  };

  const columns = [
    {
      key: 'name',
      header: t('stations.name'),
      primary: true,
      render: (r: any) => (
        <div>
          <div className="font-medium text-slate-900">{r.name}</div>
          <div className="text-xs text-slate-400">{r.code}</div>
        </div>
      ),
    },
    { key: 'region', header: t('stations.region'), render: (r: any) => r.region ?? '—' },
    { key: 'manager', header: t('stations.manager'), render: (r: any) => r.manager ?? '—', hideOnMobile: true },
    { key: 'status', header: t('common.status'), render: (r: any) => <StatusPill status={r.status} /> },
  ];

  return (
    <div>
      <PageHeader
        title={t('stations.title')}
        action={
          can('station.write') && (
            <Button onClick={() => setOpen(true)}>
              <Plus size={16} /> {t('stations.new')}
            </Button>
          )
        }
      />
      <Card>
        <DataTable columns={columns} rows={rows ?? []} loading={isLoading} />
      </Card>

      <Modal open={open} onClose={() => setOpen(false)} title={t('stations.new')}>
        <form onSubmit={submit} className="space-y-4">
          <Field label={t('stations.name')}>
            <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label={t('stations.region')}>
              <Input value={form.region} onChange={(e) => setForm({ ...form, region: e.target.value })} />
            </Field>
            <Field label="Zone / Woreda">
              <Input value={form.zone} onChange={(e) => setForm({ ...form, zone: e.target.value })} />
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label={t('stations.manager')}>
              <Input value={form.manager} onChange={(e) => setForm({ ...form, manager: e.target.value })} />
            </Field>
            <Field label={t('stations.capacity')}>
              <Input type="number" value={form.capacityTons} onChange={(e) => setForm({ ...form, capacityTons: e.target.value })} />
            </Field>
          </div>
          <Field label={t('common.status')}>
            <Select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>
              <option value="Active">Active</option>
              <option value="Inactive">Inactive</option>
            </Select>
          </Field>
          <div className="flex justify-end gap-2 pt-1">
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>{t('common.cancel')}</Button>
            <Button type="submit">{t('common.save')}</Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
