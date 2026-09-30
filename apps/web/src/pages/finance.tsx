import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Plus } from 'lucide-react';
import { PageHeader } from '@/components/PageHeader';
import { Button, Card, Field, Input, Modal, Select, StatusPill } from '@/components/ui';
import { DataTable } from '@/components/DataTable';
import { useList, useOfflineSave } from '@/lib/queries';
import { useAuth } from '@/lib/auth';
import { formatMoney, EXPENSE_CATEGORY, PAYMENT_METHOD } from '@madda/shared';

const CURRENCIES = ['ETB', 'USD', 'EUR', 'GBP'];

export function PaymentsPage() {
  const { t } = useTranslation();
  const { can } = useAuth();
  const [open, setOpen] = useState(false);
  const { data: rows, isLoading } = useList<any[]>(['payments'], '/payments');
  const { data: stations } = useList<any[]>(['stations'], '/stations');
  const save = useOfflineSave([['payments']], { url: '/payments' });
  const [form, setForm] = useState<any>({ date: new Date().toISOString().slice(0, 10), stationId: '', payee: '', type: 'Supplier', amount: '', currency: 'ETB', method: 'Cash', status: 'Paid' });

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    await save.mutateAsync({ ...form, amount: Number(form.amount) });
    setOpen(false);
  };

  const columns = [
    { key: 'code', header: 'Payment', primary: true, render: (r: any) => <div><div className="font-medium">{r.code}</div><div className="text-xs text-slate-400">{r.payee} · {r.type}</div></div> },
    { key: 'date', header: t('common.date'), render: (r: any) => new Date(r.date).toLocaleDateString() },
    { key: 'method', header: 'Method', hideOnMobile: true },
    { key: 'amount', header: t('common.amount'), render: (r: any) => formatMoney(r.amount, r.currency) },
    { key: 'status', header: t('common.status'), render: (r: any) => <StatusPill status={r.status} /> },
  ];

  return (
    <div>
      <PageHeader title={t('nav.finance') + ' — Payments'} action={can('payment.write') && <Button onClick={() => setOpen(true)}><Plus size={16} />New Payment</Button>} />
      <Card><DataTable columns={columns} rows={rows ?? []} loading={isLoading} /></Card>
      <Modal open={open} onClose={() => setOpen(false)} title="New Payment">
        <form onSubmit={submit} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <Field label={t('common.date')}><Input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} required /></Field>
            <Field label="Type">
              <Select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}>
                {['Supplier', 'Expense', 'Salary', 'Refund', 'Other'].map((x) => <option key={x}>{x}</option>)}
              </Select>
            </Field>
          </div>
          <Field label="Payee"><Input value={form.payee} onChange={(e) => setForm({ ...form, payee: e.target.value })} required /></Field>
          <div className="grid grid-cols-3 gap-3">
            <Field label={t('common.amount')}><Input type="number" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} required /></Field>
            <Field label={t('common.currency')}><Select value={form.currency} onChange={(e) => setForm({ ...form, currency: e.target.value })}>{CURRENCIES.map((c) => <option key={c}>{c}</option>)}</Select></Field>
            <Field label="Method"><Select value={form.method} onChange={(e) => setForm({ ...form, method: e.target.value })}>{PAYMENT_METHOD.map((m) => <option key={m}>{m}</option>)}</Select></Field>
          </div>
          <Field label={t('common.station')}>
            <Select value={form.stationId} onChange={(e) => setForm({ ...form, stationId: e.target.value })}>
              <option value="">—</option>
              {stations?.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
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

export function ExpensesPage() {
  const { t } = useTranslation();
  const { can } = useAuth();
  const [open, setOpen] = useState(false);
  const { data: rows, isLoading } = useList<any[]>(['expenses'], '/expenses');
  const { data: stations } = useList<any[]>(['stations'], '/stations');
  const save = useOfflineSave([['expenses']], { url: '/expenses' });
  const [form, setForm] = useState<any>({ date: new Date().toISOString().slice(0, 10), stationId: '', category: 'Labor', description: '', amount: '', currency: 'ETB', paymentStatus: 'Pending' });

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    await save.mutateAsync({ ...form, amount: Number(form.amount) });
    setOpen(false);
  };

  const columns = [
    { key: 'code', header: 'Expense', primary: true, render: (r: any) => <div><div className="font-medium">{r.code}</div><div className="text-xs text-slate-400">{r.description}</div></div> },
    { key: 'category', header: 'Category', render: (r: any) => <StatusPill status={r.category} /> },
    { key: 'date', header: t('common.date'), render: (r: any) => new Date(r.date).toLocaleDateString(), hideOnMobile: true },
    { key: 'amount', header: t('common.amount'), render: (r: any) => formatMoney(r.amount, r.currency) },
    { key: 'paymentStatus', header: t('common.status'), render: (r: any) => <StatusPill status={r.paymentStatus} /> },
  ];

  return (
    <div>
      <PageHeader title={t('nav.finance') + ' — Expenses'} action={can('expense.write') && <Button onClick={() => setOpen(true)}><Plus size={16} />New Expense</Button>} />
      <Card><DataTable columns={columns} rows={rows ?? []} loading={isLoading} /></Card>
      <Modal open={open} onClose={() => setOpen(false)} title="New Expense">
        <form onSubmit={submit} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <Field label={t('common.date')}><Input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} required /></Field>
            <Field label="Category"><Select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>{EXPENSE_CATEGORY.map((c) => <option key={c}>{c}</option>)}</Select></Field>
          </div>
          <Field label="Description"><Input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} required /></Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label={t('common.amount')}><Input type="number" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} required /></Field>
            <Field label={t('common.currency')}><Select value={form.currency} onChange={(e) => setForm({ ...form, currency: e.target.value })}>{CURRENCIES.map((c) => <option key={c}>{c}</option>)}</Select></Field>
          </div>
          <Field label={t('common.station')}>
            <Select value={form.stationId} onChange={(e) => setForm({ ...form, stationId: e.target.value })} required>
              <option value="">—</option>
              {stations?.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
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
