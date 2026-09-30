import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Plus } from 'lucide-react';
import { PageHeader } from '@/components/PageHeader';
import { Button, Card, Field, Input, Modal, Select, StatusPill } from '@/components/ui';
import { DataTable } from '@/components/DataTable';
import { useList, useOfflineSave } from '@/lib/queries';
import { useAuth } from '@/lib/auth';
import { SUPPLIER_TYPE } from '@madda/shared';

export function SuppliersPage() {
  const { t } = useTranslation();
  const { can } = useAuth();
  const [open, setOpen] = useState(false);
  const { data: rows, isLoading } = useList<any[]>(['suppliers'], '/suppliers');
  const save = useOfflineSave([['suppliers']], { url: '/suppliers' });
  const [form, setForm] = useState<any>({ name: '', type: 'Farmer', phone: '', location: '', bankInfo: '', status: 'Active' });

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    await save.mutateAsync(form);
    setOpen(false);
  };

  const columns = [
    {
      key: 'name',
      header: t('suppliers.name'),
      primary: true,
      render: (r: any) => (
        <div>
          <div className="font-medium text-slate-900">{r.name}</div>
          <div className="text-xs text-slate-400">{r.code}</div>
        </div>
      ),
    },
    { key: 'type', header: t('suppliers.type'), render: (r: any) => <StatusPill status={r.type} /> },
    { key: 'phone', header: t('suppliers.phone'), render: (r: any) => r.phone ?? '—' },
    { key: 'location', header: t('suppliers.location'), render: (r: any) => r.location ?? '—', hideOnMobile: true },
  ];

  return (
    <div>
      <PageHeader
        title={t('suppliers.title')}
        action={
          can('supplier.write') && (
            <Button onClick={() => setOpen(true)}>
              <Plus size={16} /> {t('suppliers.new')}
            </Button>
          )
        }
      />
      <Card>
        <DataTable columns={columns} rows={rows ?? []} loading={isLoading} />
      </Card>

      <Modal open={open} onClose={() => setOpen(false)} title={t('suppliers.new')}>
        <form onSubmit={submit} className="space-y-4">
          <Field label={t('suppliers.name')}>
            <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label={t('suppliers.type')}>
              <Select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}>
                {SUPPLIER_TYPE.map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </Select>
            </Field>
            <Field label={t('suppliers.phone')}>
              <Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
            </Field>
          </div>
          <Field label={t('suppliers.location')}>
            <Input value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} />
          </Field>
          <Field label="Bank / Payment info" hint="Used to pay the farmer/supplier.">
            <Input value={form.bankInfo} onChange={(e) => setForm({ ...form, bankInfo: e.target.value })} />
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
