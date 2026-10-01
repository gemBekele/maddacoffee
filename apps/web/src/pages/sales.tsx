import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { Plus, Trash2, ArrowRight } from 'lucide-react';
import { PageHeader } from '@/components/PageHeader';
import { Button, Card, Field, Input, Modal, Select, StatusPill } from '@/components/ui';
import { DataTable } from '@/components/DataTable';
import { useList, useOfflineSave } from '@/lib/queries';
import { useAuth } from '@/lib/auth';
import { formatKg, formatMoney, PROFORMA_STATUS, CONTRACT_STATUS, SHIPMENT_STATUS, SHIPMENT_MODE } from '@madda/shared';

const CURRENCIES = ['USD', 'EUR', 'GBP', 'ETB'];

function useBuyers() {
  return useList<any[]>(['buyers'], '/buyers');
}

// ─────────────────────────── Buyers ───────────────────────────
export function BuyersPage() {
  const { t } = useTranslation();
  const { can } = useAuth();
  const [open, setOpen] = useState(false);
  const { data: rows, isLoading } = useBuyers();
  const save = useOfflineSave([['buyers']], { url: '/buyers' });
  const [form, setForm] = useState<any>({ name: '', country: '', contactName: '', email: '', phone: '', incoterm: 'FOB', currency: 'USD' });

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    await save.mutateAsync(form);
    setOpen(false);
  };

  const columns = [
    {
      key: 'name',
      header: 'Buyer',
      primary: true,
      render: (r: any) => (
        <div>
          <div className="font-medium text-slate-900">{r.name}</div>
          <div className="text-xs text-slate-400">{r.code} · {r.country ?? '—'}</div>
        </div>
      ),
    },
    { key: 'contact', header: 'Contact', render: (r: any) => r.contactName ?? '—', hideOnMobile: true },
    { key: 'email', header: 'Email', render: (r: any) => r.email ?? '—' },
    { key: 'incoterm', header: 'Incoterm', render: (r: any) => <StatusPill status={r.incoterm} /> },
  ];

  return (
    <div>
      <PageHeader
        title={t('nav.sales') + ' — Buyers'}
        action={can('buyer.write') && <Button onClick={() => setOpen(true)}><Plus size={16} />New Buyer</Button>}
      />
      <Card><DataTable columns={columns} rows={rows ?? []} loading={isLoading} /></Card>
      <Modal open={open} onClose={() => setOpen(false)} title="New Buyer">
        <form onSubmit={submit} className="space-y-4">
          <Field label="Company name"><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required /></Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Country"><Input value={form.country} onChange={(e) => setForm({ ...form, country: e.target.value })} /></Field>
            <Field label="Contact name"><Input value={form.contactName} onChange={(e) => setForm({ ...form, contactName: e.target.value })} /></Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Email"><Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></Field>
            <Field label="Phone"><Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Incoterm">
              <Select value={form.incoterm} onChange={(e) => setForm({ ...form, incoterm: e.target.value })}>
                {['FOB', 'CIF', 'FCA', 'DAP', 'EXW'].map((i) => <option key={i}>{i}</option>)}
              </Select>
            </Field>
            <Field label="Currency">
              <Select value={form.currency} onChange={(e) => setForm({ ...form, currency: e.target.value })}>
                {CURRENCIES.map((c) => <option key={c}>{c}</option>)}
              </Select>
            </Field>
          </div>
          <div className="flex justify-end gap-2 pt-1">
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>{t('common.cancel')}</Button>
            <Button type="submit">{t('common.save')}</Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}

// ─────────────────────────── Line editor ───────────────────────────
function LineEditor({ lines, setLines }: { lines: any[]; setLines: (l: any[]) => void }) {
  const update = (i: number, patch: any) => {
    const next = [...lines];
    next[i] = { ...next[i], ...patch };
    setLines(next);
  };
  return (
    <div className="space-y-2">
      {lines.map((l, i) => (
        <div key={i} className="grid grid-cols-12 gap-2">
          <input className="input col-span-5" placeholder="Description" value={l.description} onChange={(e) => update(i, { description: e.target.value })} required />
          <input className="input col-span-2" type="number" placeholder="KG" value={l.quantityKg} onChange={(e) => update(i, { quantityKg: e.target.value })} required />
          <input className="input col-span-3" type="number" step="0.01" placeholder="Price/KG" value={l.pricePerKg} onChange={(e) => update(i, { pricePerKg: e.target.value })} required />
          <button type="button" className="col-span-2 flex items-center justify-center rounded-lg border border-slate-200 text-slate-400" onClick={() => setLines(lines.filter((_, x) => x !== i))}>
            <Trash2 size={15} />
          </button>
        </div>
      ))}
      <button type="button" onClick={() => setLines([...lines, { description: '', quantityKg: '', pricePerKg: '' }])} className="text-sm font-medium text-brand-700">
        + Add line
      </button>
    </div>
  );
}

// ─────────────────────────── Quotations ───────────────────────────
export function QuotationsPage() {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const { data: rows, isLoading } = useList<any[]>(['quotations'], '/quotations');
  const { data: buyers } = useBuyers();
  const save = useOfflineSave([['quotations']], { url: '/quotations' });
  const [form, setForm] = useState<any>({ date: new Date().toISOString().slice(0, 10), buyerId: '', currency: 'USD', incoterm: 'FOB', lines: [{ description: '', quantityKg: '', pricePerKg: '' }] });

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    await save.mutateAsync({ ...form, lines: form.lines.map((l: any) => ({ ...l, quantityKg: Number(l.quantityKg), pricePerKg: Number(l.pricePerKg) })) });
    setOpen(false);
  };

  const columns = [
    { key: 'code', header: 'Quotation', primary: true, render: (r: any) => <div><div className="font-medium">{r.code}</div><div className="text-xs text-slate-400">{r.buyer?.name}</div></div> },
    { key: 'date', header: t('common.date'), render: (r: any) => new Date(r.date).toLocaleDateString() },
    { key: 'amount', header: 'Value', render: (r: any) => formatMoney(r.lines?.reduce((a: number, l: any) => a + Number(l.amount), 0) ?? 0, r.currency) },
    { key: 'status', header: t('common.status'), render: (r: any) => <StatusPill status={r.status} /> },
  ];

  return (
    <div>
      <PageHeader title={t('nav.sales') + ' — Quotations'} action={<Button onClick={() => setOpen(true)}><Plus size={16} />New Quotation</Button>} />
      <Card><DataTable columns={columns} rows={rows ?? []} loading={isLoading} /></Card>
      <Modal open={open} onClose={() => setOpen(false)} title="New Quotation">
        <form onSubmit={submit} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <Field label={t('common.date')}><Input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} required /></Field>
            <Field label="Buyer">
              <Select value={form.buyerId} onChange={(e) => setForm({ ...form, buyerId: e.target.value })} required>
                <option value="">—</option>
                {buyers?.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
              </Select>
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Currency"><Select value={form.currency} onChange={(e) => setForm({ ...form, currency: e.target.value })}>{CURRENCIES.map((c) => <option key={c}>{c}</option>)}</Select></Field>
            <Field label="Incoterm"><Input value={form.incoterm} onChange={(e) => setForm({ ...form, incoterm: e.target.value })} /></Field>
          </div>
          <Field label="Lines"><LineEditor lines={form.lines} setLines={(l) => setForm({ ...form, lines: l })} /></Field>
          <div className="flex justify-end gap-2 pt-1">
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>{t('common.cancel')}</Button>
            <Button type="submit">{t('common.save')}</Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}

// ─────────────────────────── Proformas ───────────────────────────
export function ProformasPage() {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const { data: rows, isLoading } = useList<any[]>(['proformas'], '/proformas');
  const { data: buyers } = useBuyers();
  const save = useOfflineSave([['proformas']], { url: '/proformas' });
  const [form, setForm] = useState<any>({ date: new Date().toISOString().slice(0, 10), buyerId: '', currency: 'USD', incoterm: 'FOB', portLoading: 'Djibouti', validity: '', paymentTerms: '30% deposit, 70% against documents', lines: [{ description: '', quantityKg: '', pricePerKg: '' }] });

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    await save.mutateAsync({ ...form, lines: form.lines.map((l: any) => ({ ...l, quantityKg: Number(l.quantityKg), pricePerKg: Number(l.pricePerKg) })) });
    setOpen(false);
  };

  const columns = [
    { key: 'code', header: 'Proforma', primary: true, render: (r: any) => <div><div className="font-medium">{r.code}</div><div className="text-xs text-slate-400">{r.buyer?.name}</div></div> },
    { key: 'date', header: t('common.date'), render: (r: any) => new Date(r.date).toLocaleDateString() },
    { key: 'amount', header: 'Value', render: (r: any) => formatMoney(r.lines?.reduce((a: number, l: any) => a + Number(l.amount), 0) ?? 0, r.currency) },
    { key: 'status', header: t('common.status'), render: (r: any) => <StatusPill status={r.status} /> },
    { key: 'open', header: '', render: (r: any) => <Link to={`/proformas/${r.id}`} className="inline-flex items-center gap-1 text-sm font-medium text-brand-700">Open <ArrowRight size={14} /></Link> },
  ];

  return (
    <div>
      <PageHeader title={t('nav.sales') + ' — Proforma Invoices'} action={<Button onClick={() => setOpen(true)}><Plus size={16} />New Proforma</Button>} />
      <Card><DataTable columns={columns} rows={rows ?? []} loading={isLoading} /></Card>
      <Modal open={open} onClose={() => setOpen(false)} title="New Proforma Invoice">
        <form onSubmit={submit} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <Field label={t('common.date')}><Input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} required /></Field>
            <Field label="Buyer">
              <Select value={form.buyerId} onChange={(e) => setForm({ ...form, buyerId: e.target.value })} required>
                <option value="">—</option>
                {buyers?.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
              </Select>
            </Field>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <Field label="Currency"><Select value={form.currency} onChange={(e) => setForm({ ...form, currency: e.target.value })}>{CURRENCIES.map((c) => <option key={c}>{c}</option>)}</Select></Field>
            <Field label="Incoterm"><Input value={form.incoterm} onChange={(e) => setForm({ ...form, incoterm: e.target.value })} /></Field>
            <Field label="Validity"><Input type="date" value={form.validity} onChange={(e) => setForm({ ...form, validity: e.target.value })} /></Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Port of loading"><Input value={form.portLoading} onChange={(e) => setForm({ ...form, portLoading: e.target.value })} /></Field>
            <Field label="Payment terms"><Input value={form.paymentTerms} onChange={(e) => setForm({ ...form, paymentTerms: e.target.value })} /></Field>
          </div>
          <Field label="Lines"><LineEditor lines={form.lines} setLines={(l) => setForm({ ...form, lines: l })} /></Field>
          <div className="flex justify-end gap-2 pt-1">
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>{t('common.cancel')}</Button>
            <Button type="submit">{t('common.save')}</Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}

// ─────────────────────────── Contracts ───────────────────────────
export function ContractsPage() {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const { data: rows, isLoading } = useList<any[]>(['contracts'], '/contracts');
  const { data: buyers } = useBuyers();
  const save = useOfflineSave([['contracts']], { url: '/contracts' });
  const [form, setForm] = useState<any>({ date: new Date().toISOString().slice(0, 10), buyerId: '', currency: 'USD', incoterm: 'FOB', amount: '', eptaRef: '' });

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    await save.mutateAsync({ ...form, amount: Number(form.amount) });
    setOpen(false);
  };

  const columns = [
    { key: 'code', header: 'Contract', primary: true, render: (r: any) => <div><div className="font-medium">{r.code}</div><div className="text-xs text-slate-400">{r.buyer?.name}</div></div> },
    { key: 'amount', header: 'Amount', render: (r: any) => formatMoney(r.amount, r.currency) },
    { key: 'eptaRef', header: 'ECTA Ref', render: (r: any) => r.eptaRef ?? '—', hideOnMobile: true },
    { key: 'status', header: t('common.status'), render: (r: any) => <StatusPill status={r.status} /> },
  ];

  return (
    <div>
      <PageHeader title={t('nav.sales') + ' — Contracts'} action={<Button onClick={() => setOpen(true)}><Plus size={16} />New Contract</Button>} />
      <Card><DataTable columns={columns} rows={rows ?? []} loading={isLoading} /></Card>
      <Modal open={open} onClose={() => setOpen(false)} title="New Sales Contract">
        <form onSubmit={submit} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <Field label={t('common.date')}><Input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} required /></Field>
            <Field label="Buyer">
              <Select value={form.buyerId} onChange={(e) => setForm({ ...form, buyerId: e.target.value })} required>
                <option value="">—</option>
                {buyers?.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
              </Select>
            </Field>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <Field label="Currency"><Select value={form.currency} onChange={(e) => setForm({ ...form, currency: e.target.value })}>{CURRENCIES.map((c) => <option key={c}>{c}</option>)}</Select></Field>
            <Field label="Incoterm"><Input value={form.incoterm} onChange={(e) => setForm({ ...form, incoterm: e.target.value })} /></Field>
            <Field label="Amount"><Input type="number" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} required /></Field>
          </div>
          <Field label="ECTA registration ref"><Input value={form.eptaRef} onChange={(e) => setForm({ ...form, eptaRef: e.target.value })} /></Field>
          <div className="flex justify-end gap-2 pt-1">
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>{t('common.cancel')}</Button>
            <Button type="submit">{t('common.save')}</Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}

// ─────────────────────────── Commercial invoices ───────────────────────────
export function CommercialPage() {
  const { t } = useTranslation();
  const { data: rows, isLoading } = useList<any[]>(['commercial'], '/commercial-invoices');
  const columns = [
    { key: 'code', header: 'Invoice', primary: true, render: (r: any) => <div><div className="font-medium">{r.code}</div><div className="text-xs text-slate-400">{r.buyer?.name}</div></div> },
    { key: 'date', header: t('common.date'), render: (r: any) => new Date(r.date).toLocaleDateString() },
    { key: 'amount', header: 'Value', render: (r: any) => formatMoney(r.lines?.reduce((a: number, l: any) => a + Number(l.amount), 0) ?? 0, r.currency) },
    { key: 'status', header: t('common.status'), render: (r: any) => <StatusPill status={r.status} /> },
    { key: 'open', header: '', render: (r: any) => <Link to={`/commercial/${r.id}`} className="inline-flex items-center gap-1 text-sm font-medium text-brand-700">Open <ArrowRight size={14} /></Link> },
  ];
  return (
    <div>
      <PageHeader title={t('nav.sales') + ' — Commercial Invoices'} subtitle="Created by converting a proforma invoice." />
      <Card><DataTable columns={columns} rows={rows ?? []} loading={isLoading} /></Card>
    </div>
  );
}

// ─────────────────────────── Shipments ───────────────────────────

export function ShipmentsPage() {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const { data: rows, isLoading } = useList<any[]>(['shipments'], '/shipments');
  const { data: contracts } = useList<any[]>(['contracts'], '/contracts');
  const save = useOfflineSave([['shipments']], { url: '/shipments' });
  const [form, setForm] = useState<any>({
    contractId: '',
    date: new Date().toISOString().slice(0, 10),
    mode: 'Sea',
    port: 'Djibouti',
    containerNo: '',
  });

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    await save.mutateAsync(form);
    setOpen(false);
  };

  const columns = [
    {
      key: 'code',
      header: 'Shipment',
      primary: true,
      render: (r: any) => (
        <div>
          <div className="font-medium">{r.code}</div>
          <div className="text-xs text-slate-400">
            {r.contract?.buyer?.name ?? '—'} · {r.mode} · {r.port ?? ''}
            {r.commercialInvoice?.destinationCountryName
              ? ` → ${r.commercialInvoice.destinationCountryName}`
              : ''}
          </div>
        </div>
      ),
    },
    { key: 'trackingStatus', header: 'Tracking', render: (r: any) => <StatusPill status={r.trackingStatus} /> },
    {
      key: 'docs',
      header: 'Docs',
      render: (r: any) => {
        const applicable = (r.documents ?? []).filter((d: any) => d.status !== 'NotApplicable');
        const ready = applicable.filter((d: any) => d.status === 'Ready' || d.status === 'Submitted').length;
        return (
          <span className="text-sm">
            <span className={ready === applicable.length && applicable.length > 0 ? 'text-emerald-700' : 'text-slate-600'}>
              {ready}/{applicable.length}
            </span>
          </span>
        );
      },
      hideOnMobile: true,
    },
    { key: 'status', header: t('common.status'), render: (r: any) => <StatusPill status={r.status} /> },
    {
      key: 'open',
      header: '',
      render: (r: any) => (
        <Link
          to={`/shipments/${r.id}`}
          className="inline-flex items-center gap-1 text-sm font-medium text-brand-700"
        >
          Track <ArrowRight size={14} />
        </Link>
      ),
    },
  ];

  return (
    <div>
      <PageHeader
        title={t('nav.sales') + ' — Shipments'}
        action={
          <Button onClick={() => setOpen(true)}>
            <Plus size={16} />New Shipment
          </Button>
        }
      />
      <Card>
        <DataTable columns={columns} rows={rows ?? []} loading={isLoading} />
      </Card>
      <Modal open={open} onClose={() => setOpen(false)} title="New Shipment">
        <form onSubmit={submit} className="space-y-4">
          <Field label="Contract">
            <Select value={form.contractId} onChange={(e) => setForm({ ...form, contractId: e.target.value })}>
              <option value="">—</option>
              {contracts?.map((c: any) => (
                <option key={c.id} value={c.id}>
                  {c.code} — {c.buyer?.name}
                  {c.buyer?.country ? ` (${c.buyer.country})` : ''}
                </option>
              ))}
            </Select>
          </Field>

          {/* Destination and the document pack belong to the commercial invoice,
              not the shipment. This form only records the physical movement. */}
          <div className="rounded-lg bg-slate-50 p-3 text-xs text-slate-500">
            Export documents are prepared on the commercial invoice. Convert the proforma to create
            the invoice and its destination-driven document pack.
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Field label={t('common.date')}>
              <Input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} />
            </Field>
            <Field label="Mode">
              <Select value={form.mode} onChange={(e) => setForm({ ...form, mode: e.target.value })}>
                {SHIPMENT_MODE.map((m) => (
                  <option key={m}>{m}</option>
                ))}
              </Select>
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Port of loading">
              <Input value={form.port} onChange={(e) => setForm({ ...form, port: e.target.value })} />
            </Field>
            <Field label="Container no.">
              <Input value={form.containerNo} onChange={(e) => setForm({ ...form, containerNo: e.target.value })} />
            </Field>
          </div>
          <div className="flex justify-end gap-2 pt-1">
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
              {t('common.cancel')}
            </Button>
            <Button type="submit">{t('common.save')}</Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
