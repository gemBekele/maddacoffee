import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useQueryClient } from '@tanstack/react-query';
import { Plus, ArrowLeft, ArrowRight, Check, UserPlus, RefreshCw, Receipt } from 'lucide-react';
import { PageHeader } from '@/components/PageHeader';
import { Button, Card, Field, Input, Modal, Select, StatusPill } from '@/components/ui';
import { DataTable } from '@/components/DataTable';
import { useList, useOfflineSave } from '@/lib/queries';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { formatKg, formatMoney, SUPPLIER_TYPE } from '@madda/shared';

const CURRENCIES = ['ETB', 'USD', 'EUR', 'GBP'];
const NEW_SUPPLIER = '__new__';

const emptyForm = () => ({
  date: new Date().toISOString().slice(0, 10),
  stationId: '',
  supplierId: '',
  receiptNo: '',
  cherryKg: '',
  pricePerKg: '',
  currency: 'ETB',
  paymentStatus: 'Pending',
});

/**
 * Cherry purchase entry.
 *
 * Two steps rather than one long form. The first captures who and where, the
 * second captures the weight and price, and a confirmation screen states what
 * is about to be recorded before it is written. A cherry purchase is a cash
 * transaction against a named farmer, so a moment to check it is worth more
 * than the clicks it costs.
 *
 * A supplier that is not on the list can be created from inside the flow, so a
 * receiver in the field never has to abandon a part-entered purchase to go and
 * add a farmer first.
 */
export function PurchasesPage() {
  const { t } = useTranslation();
  const { can } = useAuth();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<1 | 2 | 3>(1);

  const { data: rows, isLoading } = useList<any[]>(['purchases'], '/purchases');
  const { data: stations } = useList<any[]>(['stations'], '/stations');
  const { data: suppliers } = useList<any[]>(['suppliers'], '/suppliers');
  const save = useOfflineSave([['purchases']], { url: '/purchases' });

  const [form, setForm] = useState<any>(emptyForm());
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [step1Touched, setStep1Touched] = useState(false);

  // Inline supplier creation.
  const [newSupplierOpen, setNewSupplierOpen] = useState(false);
  const [newSupplier, setNewSupplier] = useState<any>({ name: '', type: 'Farmer', phone: '', location: '' });
  const [creatingSupplier, setCreatingSupplier] = useState(false);
  const [supplierError, setSupplierError] = useState<string | null>(null);

  const supplierName = useMemo(
    () => suppliers?.find((s: any) => s.id === form.supplierId)?.name ?? '—',
    [suppliers, form.supplierId],
  );
  const stationName = useMemo(
    () => stations?.find((s: any) => s.id === form.stationId)?.name ?? '—',
    [stations, form.stationId],
  );

  const total = Number(form.cherryKg || 0) * Number(form.pricePerKg || 0);

  const close = () => {
    setOpen(false);
    setStep(1);
    setForm(emptyForm());
    setErrors({});
    setStep1Touched(false);
    setSupplierError(null);
  };

  // ── step 1 validation ────────────────────────────────────────────────
  const step1Errors = () => {
    const e: Record<string, string> = {};
    if (!form.date) e.date = 'Required';
    if (!form.stationId) e.stationId = 'Choose the station receiving the cherry';
    if (!form.supplierId) e.supplierId = 'Choose the supplier, or add a new one';
    else if (form.supplierId === NEW_SUPPLIER) e.supplierId = 'Finish adding the new supplier';
    return e;
  };

  const goToStep2 = () => {
    setStep1Touched(true);
    const e = step1Errors();
    setErrors(e);
    if (!Object.keys(e).length) setStep(2);
  };

  const goToStep3 = () => {
    const e: Record<string, string> = {};
    const kg = Number(form.cherryKg);
    const price = Number(form.pricePerKg);
    if (!form.cherryKg || !(kg > 0)) e.cherryKg = 'Enter a weight greater than zero';
    if (form.pricePerKg === '' || !(price >= 0)) e.pricePerKg = 'Enter the price per kg';
    setErrors(e);
    if (!Object.keys(e).length) setStep(3);
  };

  const submit = async () => {
    await save.mutateAsync({
      date: form.date,
      stationId: form.stationId,
      supplierId: form.supplierId,
      // Blank means "let the system assign one". The server generates it so
      // the purchase and its receipt number are written atomically.
      receiptNo: form.receiptNo.trim() || null,
      cherryKg: Number(form.cherryKg),
      pricePerKg: Number(form.pricePerKg),
      currency: form.currency,
      paymentStatus: form.paymentStatus,
    });
    close();
  };

  const createSupplier = async () => {
    setSupplierError(null);
    if (!newSupplier.name || newSupplier.name.trim().length < 2) {
      setSupplierError('Enter the supplier name');
      return;
    }
    setCreatingSupplier(true);
    try {
      const res = await api.post('/suppliers', {
        name: newSupplier.name.trim(),
        type: newSupplier.type,
        phone: newSupplier.phone || null,
        location: newSupplier.location || null,
      });
      // Refresh the list, then select what was just created so the receiver
      // lands back on the purchase with the supplier already chosen.
      await qc.invalidateQueries({ queryKey: ['suppliers'] });
      setForm((f: any) => ({ ...f, supplierId: res.data.id }));
      setErrors((e) => ({ ...e, supplierId: '' }));
      setNewSupplier({ name: '', type: 'Farmer', phone: '', location: '' });
      setNewSupplierOpen(false);
    } catch (err: any) {
      setSupplierError(
        err?.response?.data?.message
          ? String(err.response.data.message)
          : 'Could not create the supplier. Check the connection and try again.',
      );
    } finally {
      setCreatingSupplier(false);
    }
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
    {
      key: 'receiptNo',
      header: t('purchases.receiptNo'),
      render: (r: any) =>
        r.receiptNo ? <span className="font-mono text-xs">{r.receiptNo}</span> : <span className="text-xs text-slate-300">—</span>,
      hideOnMobile: true,
    },
    { key: 'station', header: t('common.station'), render: (r: any) => r.station?.name ?? '—', hideOnMobile: true },
    { key: 'cherryKg', header: t('purchases.cherryKg'), render: (r: any) => formatKg(r.cherryKg) },
    { key: 'totalAmount', header: t('purchases.total'), render: (r: any) => formatMoney(r.totalAmount, r.currency) },
    { key: 'paymentStatus', header: t('purchases.payment'), render: (r: any) => <StatusPill status={r.paymentStatus} /> },
  ];

  const stepLabel = step === 1 ? 'Who and where' : step === 2 ? 'Quantity and price' : 'Confirm';

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

      <Modal open={open} onClose={close} title={`${t('purchases.new')} — ${stepLabel}`}>
        {/* Progress so the receiver knows there is more than one screen. */}
        <div className="mb-4 flex items-center gap-1.5">
          {[1, 2, 3].map((n) => (
            <div key={n} className="flex flex-1 items-center gap-1.5">
              <span
                className={`grid h-6 w-6 shrink-0 place-items-center rounded-full text-[11px] font-semibold ${
                  step >= n ? 'bg-brand-700 text-white' : 'bg-slate-200 text-slate-500'
                }`}
              >
                {step > n ? <Check size={12} /> : n}
              </span>
              {n < 3 && <span className={`h-0.5 flex-1 rounded ${step > n ? 'bg-brand-700' : 'bg-slate-200'}`} />}
            </div>
          ))}
        </div>

        {/* ── step 1: who and where ─────────────────────────────────── */}
        {step === 1 && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <Field label={t('common.date')}>
                <Input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} required />
              </Field>
              <Field label={t('common.station')}>
                <Select value={form.stationId} onChange={(e) => setForm({ ...form, stationId: e.target.value })}>
                  <option value="">—</option>
                  {stations?.map((s: any) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </Select>
              </Field>
            </div>
            {step1Touched && errors.stationId && <p className="-mt-2 text-xs text-rose-600">{errors.stationId}</p>}

            <Field label={t('purchases.supplier')}>
              <div className="flex gap-2">
                <Select
                  value={form.supplierId}
                  onChange={(e) => setForm({ ...form, supplierId: e.target.value })}
                  className="flex-1"
                >
                  <option value="">—</option>
                  {suppliers?.map((s: any) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                      {s.location ? ` · ${s.location}` : ''}
                    </option>
                  ))}
                  <option value={NEW_SUPPLIER}>+ Add a new supplier…</option>
                </Select>
              </div>
            </Field>
            {step1Touched && errors.supplierId && <p className="-mt-2 text-xs text-rose-600">{errors.supplierId}</p>}

            {/* Inline creation so a part-entered purchase is never abandoned. */}
            <button
              type="button"
              onClick={() => setNewSupplierOpen(true)}
              className="inline-flex items-center gap-1.5 text-xs font-medium text-brand-700 hover:underline"
            >
              <UserPlus size={13} /> Supplier not on the list? Add one without leaving this purchase
            </button>

            <div className="flex justify-end gap-2 pt-1">
              <Button type="button" variant="ghost" onClick={close}>
                {t('common.cancel')}
              </Button>
              <Button type="button" onClick={goToStep2}>
                Continue <ArrowRight size={15} />
              </Button>
            </div>
          </div>
        )}

        {/* ── step 2: quantity and price ────────────────────────────── */}
        {step === 2 && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <Field label={t('purchases.cherryKg')}>
                <Input
                  type="number"
                  step="0.01"
                  value={form.cherryKg}
                  onChange={(e) => setForm({ ...form, cherryKg: e.target.value })}
                  autoFocus
                />
              </Field>
              <Field label={t('purchases.pricePerKg')}>
                <Input
                  type="number"
                  step="0.01"
                  value={form.pricePerKg}
                  onChange={(e) => setForm({ ...form, pricePerKg: e.target.value })}
                />
              </Field>
            </div>
            {(errors.cherryKg || errors.pricePerKg) && (
              <p className="-mt-2 text-xs text-rose-600">{errors.cherryKg || errors.pricePerKg}</p>
            )}

            <div className="rounded-lg bg-slate-50 px-3 py-2.5 text-sm">
              <div className="flex items-baseline justify-between">
                <span className="text-slate-500">Total</span>
                <span className="text-lg font-semibold text-slate-900">{formatMoney(total, form.currency)}</span>
              </div>
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

            <Field
              label={t('purchases.receiptNo')}
              hint="Leave blank and the system assigns one, or enter the pre-printed receipt number."
            >
              <Input
                value={form.receiptNo}
                onChange={(e) => setForm({ ...form, receiptNo: e.target.value })}
                placeholder="Assigned automatically"
              />
            </Field>

            <div className="flex justify-between gap-2 pt-1">
              <Button type="button" variant="ghost" onClick={() => setStep(1)}>
                <ArrowLeft size={15} /> Back
              </Button>
              <Button type="button" onClick={goToStep3}>
                Review <ArrowRight size={15} />
              </Button>
            </div>
          </div>
        )}

        {/* ── step 3: confirmation ──────────────────────────────────── */}
        {step === 3 && (
          <div className="space-y-4">
            <div className="flex items-start gap-2.5 rounded-lg bg-brand-50 p-3">
              <Receipt size={16} className="mt-0.5 shrink-0 text-brand-700" />
              <p className="text-xs text-brand-900">
                Check the details below before saving. This records a purchase against the named supplier and posts it
                to the station.
              </p>
            </div>

            <dl className="divide-y divide-slate-100 rounded-lg border border-slate-200">
              {[
                ['Date', new Date(form.date).toLocaleDateString([], { day: 'numeric', month: 'long', year: 'numeric' })],
                ['Station', stationName],
                ['Supplier', supplierName],
                ['Quantity', formatKg(Number(form.cherryKg))],
                ['Price per kg', formatMoney(Number(form.pricePerKg), form.currency)],
                ['Payment status', form.paymentStatus],
                ['Receipt no.', form.receiptNo.trim() || 'Assigned automatically'],
              ].map(([label, value]) => (
                <div key={label} className="flex items-baseline justify-between px-3 py-2 text-sm">
                  <dt className="text-slate-500">{label}</dt>
                  <dd className="text-right font-medium text-slate-800">{value}</dd>
                </div>
              ))}
              <div className="flex items-baseline justify-between bg-slate-50 px-3 py-2.5">
                <dt className="text-sm font-medium text-slate-700">Total</dt>
                <dd className="text-lg font-semibold text-slate-900">{formatMoney(total, form.currency)}</dd>
              </div>
            </dl>

            <div className="flex justify-between gap-2 pt-1">
              <Button type="button" variant="ghost" onClick={() => setStep(2)}>
                <ArrowLeft size={15} /> Back
              </Button>
              <Button type="button" onClick={submit} disabled={save.isPending}>
                {save.isPending ? <RefreshCw size={14} className="animate-spin" /> : <Check size={15} />}
                Confirm and save
              </Button>
            </div>
          </div>
        )}
      </Modal>

      {/* ── new supplier, nested so the purchase form stays behind it ── */}
      <Modal open={newSupplierOpen} onClose={() => setNewSupplierOpen(false)} title="Add supplier">
        <div className="space-y-3">
          <Field label="Name">
            <Input
              value={newSupplier.name}
              onChange={(e) => setNewSupplier({ ...newSupplier, name: e.target.value })}
              placeholder="Farmer or cooperative name"
              autoFocus
            />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Type">
              <Select value={newSupplier.type} onChange={(e) => setNewSupplier({ ...newSupplier, type: e.target.value })}>
                {SUPPLIER_TYPE.map((x) => (
                  <option key={x} value={x}>
                    {x}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Phone">
              <Input
                value={newSupplier.phone}
                onChange={(e) => setNewSupplier({ ...newSupplier, phone: e.target.value })}
                placeholder="+251 …"
              />
            </Field>
          </div>
          <Field label="Location" hint="Village, kebele or woreda">
            <Input
              value={newSupplier.location}
              onChange={(e) => setNewSupplier({ ...newSupplier, location: e.target.value })}
            />
          </Field>

          {supplierError && <p className="text-xs text-rose-600">{supplierError}</p>}

          <div className="flex justify-end gap-2 pt-1">
            <Button type="button" variant="ghost" onClick={() => setNewSupplierOpen(false)}>
              {t('common.cancel')}
            </Button>
            <Button type="button" onClick={createSupplier} disabled={creatingSupplier}>
              {creatingSupplier ? <RefreshCw size={14} className="animate-spin" /> : <UserPlus size={15} />}
              Add and select
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
