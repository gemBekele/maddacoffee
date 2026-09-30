import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Plus } from 'lucide-react';
import { PageHeader } from '@/components/PageHeader';
import { Button, Card, Field, Input, Modal, Select, StatusPill } from '@/components/ui';
import { DataTable } from '@/components/DataTable';
import { useList, useOfflineSave } from '@/lib/queries';
import { useAuth } from '@/lib/auth';
import { formatKg, formatMoney } from '@madda/shared';

const CURRENCIES = ['ETB', 'USD', 'EUR', 'GBP'];

export function PurchasesPage() {
  const { t } = useTranslation();
  const { can } = useAuth();
  const [open, setOpen] = useState(false);
  const { data: rows, isLoading } = useList<any[]>(['purchases'], '/purchases');
  const { data: stations } = useList<any[]>(['stations'], '/stations');
  const { data: suppliers } = useList<any[]>(['suppliers'], '/suppliers');
  const save = useOfflineSave([['purchases']], { url: '/purchases' });

  const [form, setForm] = useState<any>({
    date: new Date().toISOString().slice(0, 10),
    stationId: '',
    supplierId: '',
    receiptNo: '',
    cherryKg: '',
    pricePerKg: '',
    currency: 'ETB',
    paymentStatus: 'Pending',
  });

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const res = await save.mutateAsync({
      ...form,
      cherryKg: Number(form.cherryKg),
      pricePerKg: Number(form.pricePerKg),
    });
    setOpen(false);
    setForm({ ...form, cherryKg: '', pricePerKg: '', receiptNo: '' });
    void res;
  };

  const columns = [
    {
      key: 'code',
      header: 'Code',
      primary: true,
      render: (r: any) => (
        <div>
          <div className="font-medium text-slate-900">{r.code}</div>
          <div className="text-xs text-slate-400">{r.supplier?.name}</div>
        </div>
      ),
    },
    { key: 'date', header: t('common.date'), render: (r: any) => new Date(r.date).toLocaleDateString() },
    { key: 'station', header: t('common.station'), render: (r: any) => r.station?.name ?? '—', hideOnMobile: true },
    { key: 'cherryKg', header: t('purchases.cherryKg'), render: (r: any) => formatKg(r.cherryKg) },
    { key: 'totalAmount', header: t('purchases.total'), render: (r: any) => formatMoney(r.totalAmount, r.currency) },
    { key: 'paymentStatus', header: t('purchases.payment'), render: (r: any) => <StatusPill status={r.paymentStatus} /> },
  ];

  return (
    <div>
      <PageHeader
        title={t('purchases.title')}
        subtitle={t('dashboard.stationPerformance')}
        action={
          can('purchase.write') && (
            <Button onClick={() => setOpen(true)}>
              <Plus size={16} /> {t('purchases.new')}
            </Button>
          )
        }
      />

      <Card>
        <DataTable columns={columns} rows={rows ?? []} loading={isLoading} />
      </Card>

      <Modal open={open} onClose={() => setOpen(false)} title={t('purchases.new')}>
        <form onSubmit={submit} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <Field label={t('common.date')}>
              <Input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} required />
            </Field>
            <Field label={t('common.station')}>
              <Select value={form.stationId} onChange={(e) => setForm({ ...form, stationId: e.target.value })} required>
                <option value="">—</option>
                {stations?.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </Select>
            </Field>
          </div>
          <Field label={t('purchases.supplier')}>
            <Select value={form.supplierId} onChange={(e) => setForm({ ...form, supplierId: e.target.value })} required>
              <option value="">—</option>
              {suppliers?.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label={t('purchases.receiptNo')}>
            <Input value={form.receiptNo} onChange={(e) => setForm({ ...form, receiptNo: e.target.value })} />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label={t('purchases.cherryKg')}>
              <Input type="number" step="0.01" value={form.cherryKg} onChange={(e) => setForm({ ...form, cherryKg: e.target.value })} required />
            </Field>
            <Field label={t('purchases.pricePerKg')}>
              <Input type="number" step="0.01" value={form.pricePerKg} onChange={(e) => setForm({ ...form, pricePerKg: e.target.value })} required />
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label={t('common.currency')}>
              <Select value={form.currency} onChange={(e) => setForm({ ...form, currency: e.target.value })}>
                {CURRENCIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label={t('purchases.payment')}>
              <Select value={form.paymentStatus} onChange={(e) => setForm({ ...form, paymentStatus: e.target.value })}>
                {['Pending', 'Partial', 'Paid'].map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </Select>
            </Field>
          </div>
          <div className="flex justify-end gap-2 pt-1">
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
              {t('common.cancel')}
            </Button>
            <Button type="submit" disabled={save.isPending}>
              {t('common.save')}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
