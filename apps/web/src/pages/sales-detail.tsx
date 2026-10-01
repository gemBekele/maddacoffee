import { useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query';
import {
  ArrowLeft,
  Send,
  FileCheck,
  CheckCircle2,
  Repeat,
  Copy,
  MessageCircle,
  Phone,
  Truck,
  Package,
  RefreshCw,
  ExternalLink,
  Building2,
  AlertTriangle,
  MapPin,
  Download,
} from 'lucide-react';
import { PageHeader } from '@/components/PageHeader';
import {
  Button,
  Card,
  StatusPill,
  Field,
  Input,
  Select,
  Modal,
  VerificationBadge,
  IssuerBadge,
} from '@/components/ui';
import { DataTable } from '@/components/DataTable';
import { InfoRow, CustomerCard, SentEmails, ActivityFeed, CustomerHistory } from '@/components/detail';
import { api } from '@/lib/api';
import { formatMoney, formatKg } from '@madda/shared';

function useDetail(key: string, url: string) {
  return useQuery({ queryKey: [key, url], queryFn: async () => (await api.get(url)).data });
}

/**
 * EUDR panel.
 *
 * Deliberately separate from the document checklist. The exporter never files a
 * Due Diligence Statement; the EU importer does. What we own is supplying plot
 * geolocation and recording the reference they hand back, so the panel is
 * framed around that rather than offering a "file DDS" action we cannot honour.
 */
function EudrPanel({ shipment }: { shipment: any }) {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ['traceability', 'eudr', shipment.id],
    queryFn: async () => (await api.get(`/traceability/eudr/${shipment.id}`)).data,
  });
  const [ddsRef, setDdsRef] = useState('');

  const link = useMutation({
    mutationFn: () => api.post(`/traceability/eudr/${shipment.id}/link-plots`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['traceability', 'eudr', shipment.id] }),
  });

  const save = useMutation({
    mutationFn: (body: any) => api.patch(`/traceability/eudr/${shipment.id}`, body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['traceability', 'eudr', shipment.id] }),
  });

  const downloadGeoJson = async () => {
    const res = await api.get(`/traceability/eudr/${shipment.id}/geojson`);
    const blob = new Blob([JSON.stringify(res.data, null, 2)], { type: 'application/geo+json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${shipment.code}-eudr-geolocation.geojson`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (isLoading || !data) return null;

  const missing: string[] = data.missingGeolocation ?? [];
  const incomplete = missing.length > 0 || (data.plotCount ?? 0) === 0;

  return (
    <Card className="p-5">
      <div className="mb-3 flex items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-1.5 text-sm font-semibold text-slate-800">
            <MapPin size={15} className="text-slate-400" /> EUDR due diligence
          </div>
          <div className="mt-0.5 text-xs text-slate-400">
            Regulation (EU) 2023/1115 · applies {data.applicationDate}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="ghost" onClick={() => link.mutate()} className="h-8 text-xs" disabled={link.isPending}>
            <RefreshCw size={13} className={link.isPending ? 'animate-spin' : ''} /> Sync plots
          </Button>
          <Button variant="ghost" onClick={downloadGeoJson} className="h-8 text-xs">
            <Download size={13} /> GeoJSON
          </Button>
        </div>
      </div>

      <div className="mb-3 rounded-lg bg-slate-50 p-3 text-xs leading-relaxed text-slate-600">
        {data.responsibility}
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-lg bg-slate-50 p-2.5">
          <div className="text-[10px] uppercase tracking-wide text-slate-400">Plots</div>
          <div className="text-lg font-semibold text-slate-900">{data.plotCount ?? 0}</div>
        </div>
        <div className="rounded-lg bg-slate-50 p-2.5">
          <div className="text-[10px] uppercase tracking-wide text-slate-400">Geolocated</div>
          <div className={`text-lg font-semibold ${incomplete ? 'text-amber-700' : 'text-emerald-700'}`}>
            {data.geolocatedCount ?? 0}
          </div>
        </div>
        <div className="rounded-lg bg-slate-50 p-2.5">
          <div className="text-[10px] uppercase tracking-wide text-slate-400">DDS reference</div>
          <div className="truncate text-sm font-semibold text-slate-900">{data.statement?.ddsReference ?? '—'}</div>
        </div>
      </div>

      {incomplete && (
        <div className="mt-3 flex items-start gap-2 rounded-lg bg-amber-50 p-3 text-xs text-amber-900 ring-1 ring-amber-600/15">
          <AlertTriangle size={14} className="mt-0.5 shrink-0" />
          <div>
            {(data.plotCount ?? 0) === 0 ? (
              <>
                <span className="font-semibold">No plot data on this shipment.</span>
                <p className="mt-0.5">
                  This shipment cannot be supported for EUDR without plot-level geolocation. Link the contributing farms
                  on the lot, or use “derive traces” to pull them from the supplier chain.
                </p>
              </>
            ) : (
              <>
                <span className="font-semibold">{missing.length} plot(s) missing geolocation.</span>
                <p className="mt-0.5">EUDR requires six-decimal coordinates: a polygon above 4 ha, a point below.</p>
              </>
            )}
          </div>
        </div>
      )}

      <div className="mt-3 flex flex-wrap items-end gap-2">
        <Field label="DDS reference from importer">
          <Input
            value={ddsRef}
            onChange={(e) => setDdsRef(e.target.value)}
            placeholder="EUDR reference issued in TRACES"
            className="h-9 w-64 text-xs"
          />
        </Field>
        <Button
          onClick={() =>
            save.mutate({
              ddsReference: ddsRef || null,
              submittedAt: ddsRef ? new Date().toISOString() : null,
              status: ddsRef ? 'Submitted' : 'NotStarted',
            })
          }
          disabled={!ddsRef || save.isPending}
          className="h-9 text-xs"
        >
          Record reference
        </Button>
        <a
          href={data.officialUrl}
          target="_blank"
          rel="noreferrer"
          className="inline-flex h-9 items-center gap-1 text-xs text-brand-700 hover:underline"
        >
          <ExternalLink size={12} /> Commission guidance
        </a>
      </div>
    </Card>
  );
}

function Stepper({ steps, current }: { steps: string[]; current: string }) {
  const idx = Math.max(0, steps.indexOf(current));
  return (
    <div className="flex flex-wrap items-center gap-2">
      {steps.map((s, i) => (
        <div key={s} className="flex items-center gap-2">
          <span className={`grid h-7 w-7 place-items-center rounded-full text-xs font-semibold ${i <= idx ? 'bg-copper-500 text-white' : 'bg-slate-100 text-slate-400'}`}>
            {i + 1}
          </span>
          <span className={`text-xs font-medium ${i <= idx ? 'text-slate-800' : 'text-slate-400'}`}>{s}</span>
          {i < steps.length - 1 && <span className="h-px w-4 bg-slate-200" />}
        </div>
      ))}
    </div>
  );
}

// ───────────────────────────── Proforma detail ─────────────────────────────

export function ProformaDetailPage() {
  const { id } = useParams();
  const { t } = useTranslation();
  const qc = useQueryClient();
  const { data: pf, isLoading } = useDetail('proforma', `/proformas/${id}`);

  const act = async (fn: () => Promise<any>) => {
    await fn();
    qc.invalidateQueries({ queryKey: ['proforma', `/proformas/${id}`] });
    qc.invalidateQueries({ queryKey: ['proformas'] });
    qc.invalidateQueries({ queryKey: ['emails'] });
    qc.invalidateQueries({ queryKey: ['activity'] });
    qc.invalidateQueries({ queryKey: ['commercial'] });
  };

  if (isLoading || !pf) return <div className="p-6 text-sm text-slate-400">{t('common.loading')}</div>;

  const total = pf.lines?.reduce((a: number, l: any) => a + Number(l.amount), 0) ?? 0;
  const steps = ['Draft', 'Issued', 'Sent', 'Responded', 'Accepted', 'Converted'];
  const columns = [
    { key: 'description', header: 'Description', primary: true },
    { key: 'quantityKg', header: 'Qty', render: (r: any) => formatKg(r.quantityKg) },
    { key: 'pricePerKg', header: 'Unit', render: (r: any) => formatMoney(r.pricePerKg, pf.currency) },
    { key: 'amount', header: 'Amount', render: (r: any) => formatMoney(r.amount, pf.currency) },
  ];

  return (
    <div>
      <Link to="/proformas" className="mb-3 inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-800">
        <ArrowLeft size={15} /> {t('nav.proformas')}
      </Link>
      <PageHeader title={`Proforma ${pf.code}`} subtitle={`${pf.buyer?.name} · ${pf.incoterm} · ${pf.currency}`} action={<StatusPill status={pf.status} />} />

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <Card className="p-5">
            <div className="mb-4 text-xs font-medium uppercase tracking-wide text-slate-400">Workflow</div>
            <Stepper steps={steps} current={pf.status === 'Cancelled' ? 'Draft' : pf.status} />
            <div className="mt-5 flex flex-wrap gap-2">
              {pf.status === 'Draft' && <Button onClick={() => act(() => api.patch(`/proformas/${id}/status`, { status: 'Issued' }))}><FileCheck size={15} /> Mark Issued</Button>}
              {['Issued', 'Sent'].includes(pf.status) && <Button variant="ghost" onClick={() => act(() => api.post(`/proformas/${id}/send`))}><Send size={15} /> Email to Buyer</Button>}
              {pf.status === 'Sent' && <Button variant="ghost" onClick={() => act(() => api.patch(`/proformas/${id}/status`, { status: 'Responded' }))}><CheckCircle2 size={15} /> Buyer Responded</Button>}
              {['Responded', 'Sent', 'Issued'].includes(pf.status) && <Button variant="ghost" onClick={() => act(() => api.patch(`/proformas/${id}/status`, { status: 'Accepted' }))}><CheckCircle2 size={15} /> Mark Accepted</Button>}
              {['Accepted', 'Responded', 'Sent', 'Issued'].includes(pf.status) && <Button onClick={() => act(() => api.post(`/proformas/${id}/convert`))}><Repeat size={15} /> Convert to Commercial Invoice</Button>}
              {pf.status === 'Converted' && pf.commercial && <Link to={`/commercial/${pf.commercial.id}`}><Button><Repeat size={15} /> Open Commercial Invoice</Button></Link>}
              {!['Converted', 'Cancelled'].includes(pf.status) && <Button variant="ghost" onClick={() => act(() => api.patch(`/proformas/${id}/status`, { status: 'Cancelled' }))}>{t('common.cancel')}</Button>}
            </div>
          </Card>

          <Card className="p-5">
            <h3 className="mb-3 text-sm font-semibold text-slate-700">Line items</h3>
            <DataTable columns={columns} rows={pf.lines ?? []} />
            <div className="mt-4 flex justify-end text-sm font-semibold text-slate-900">Total: {formatMoney(total, pf.currency)}</div>
          </Card>
        </div>

        <div className="space-y-4">
          <Card className="p-5">
            <h3 className="mb-2 text-sm font-semibold text-slate-800">Customer details</h3>
            <CustomerCard buyer={pf.buyer} />
          </Card>
          <Card className="p-5"><SentEmails entity="ProformaInvoice" entityId={id} /></Card>
          <Card className="p-5"><CustomerHistory buyerId={pf.buyer?.id} /></Card>
          <Card className="p-5"><ActivityFeed entity="ProformaInvoice" entityId={id} /></Card>
        </div>
      </div>
    </div>
  );
}

// ───────────────────────────── Commercial detail ─────────────────────────────

export function CommercialDetailPage() {
  const { id } = useParams();
  const { t } = useTranslation();
  const qc = useQueryClient();
  const { data: inv, isLoading } = useDetail('commercial-invoice', `/commercial-invoices/${id}`);
  const act = async (fn: () => Promise<any>) => {
    await fn();
    qc.invalidateQueries({ queryKey: ['commercial-invoice', `/commercial-invoices/${id}`] });
    qc.invalidateQueries({ queryKey: ['commercial'] });
    qc.invalidateQueries({ queryKey: ['emails'] });
    qc.invalidateQueries({ queryKey: ['activity'] });
  };
  if (isLoading || !inv) return <div className="p-6 text-sm text-slate-400">{t('common.loading')}</div>;
  const total = inv.lines?.reduce((a: number, l: any) => a + Number(l.amount), 0) ?? 0;
  const columns = [
    { key: 'description', header: 'Description', primary: true },
    { key: 'quantityKg', header: 'Qty', render: (r: any) => formatKg(r.quantityKg) },
    { key: 'pricePerKg', header: 'Unit', render: (r: any) => formatMoney(r.pricePerKg, inv.currency) },
    { key: 'amount', header: 'Amount', render: (r: any) => formatMoney(r.amount, inv.currency) },
  ];
  return (
    <div>
      <Link to="/commercial" className="mb-3 inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-800">
        <ArrowLeft size={15} /> Commercial Invoices
      </Link>
      <PageHeader title={`Commercial Invoice ${inv.code}`} subtitle={`${inv.buyer?.name} · HS ${inv.hsCode} · ${inv.incoterm}`} action={<StatusPill status={inv.status} />} />
      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <Card className="p-5">
            <div className="flex flex-wrap gap-2">
              {inv.status === 'Draft' && <Button onClick={() => act(() => api.patch(`/commercial-invoices/${id}/status`, { status: 'Issued' }))}><FileCheck size={15} /> Mark Issued</Button>}
              {['Draft', 'Issued'].includes(inv.status) && <Button variant="ghost" onClick={() => act(() => api.post(`/commercial-invoices/${id}/send`))}><Send size={15} /> Email to Buyer</Button>}
              {inv.status !== 'Paid' && <Button variant="ghost" onClick={() => act(() => api.patch(`/commercial-invoices/${id}/status`, { status: 'Paid' }))}><CheckCircle2 size={15} /> Mark Paid</Button>}
            </div>
          </Card>
          <Card className="p-5">
            <h3 className="mb-3 text-sm font-semibold text-slate-700">Line items</h3>
            <DataTable columns={columns} rows={inv.lines ?? []} />
            <div className="mt-4 flex justify-end text-sm font-semibold text-slate-900">Total: {formatMoney(total, inv.currency)}</div>
          </Card>
        </div>
        <div className="space-y-4">
          <Card className="p-5"><h3 className="mb-2 text-sm font-semibold text-slate-800">Customer details</h3><CustomerCard buyer={inv.buyer} /></Card>
          <Card className="p-5"><SentEmails entity="CommercialInvoice" entityId={id} /></Card>
          <Card className="p-5"><CustomerHistory buyerId={inv.buyer?.id} /></Card>
          <Card className="p-5"><ActivityFeed entity="CommercialInvoice" entityId={id} /></Card>
        </div>
      </div>
    </div>
  );
}

// ───────────────────────────── Shipment detail (tracking) ─────────────────────────────

const TRACK_STEPS = ['Received', 'In Transit', 'Delivered'];

export function ShipmentDetailPage() {
  const { id } = useParams();
  const qc = useQueryClient();
  const { data: sh, isLoading } = useDetail('shipment', `/shipments/${id}`);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ status: 'In Transit', location: '', note: '' });

  const track = useMutation({
    mutationFn: (payload: any) => api.patch(`/shipments/${id}/tracking`, payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['shipment', `/shipments/${id}`] });
      qc.invalidateQueries({ queryKey: ['shipments'] });
      qc.invalidateQueries({ queryKey: ['activity'] });
      setOpen(false);
    },
  });

  const setDoc = async (docId: string, status: string) => {
    await api.patch(`/shipments/documents/${docId}`, { status });
    qc.invalidateQueries({ queryKey: ['shipment', `/shipments/${id}`] });
  };

  // Changing the destination re-resolves the whole checklist server-side, so the
  // client does not try to derive requirements locally.
  const [applying, setApplying] = useState(false);
  const setDestination = async (countryCode: string) => {
    setApplying(true);
    try {
      await api.patch(`/shipments/${id}/compliance/destination`, {
        destinationCountryCode: countryCode || null,
        productForm: sh?.productForm ?? 'Green',
      });
      await qc.invalidateQueries({ queryKey: ['shipment', `/shipments/${id}`] });
      qc.invalidateQueries({ queryKey: ['shipments'] });
    } finally {
      setApplying(false);
    }
  };

  const reapply = async () => {
    setApplying(true);
    try {
      await api.post(`/shipments/${id}/compliance/apply`, { regenerate: false });
      await qc.invalidateQueries({ queryKey: ['shipment', `/shipments/${id}`] });
    } finally {
      setApplying(false);
    }
  };

  const { data: profiles } = useQuery({
    queryKey: ['compliance', 'profiles'],
    queryFn: async () => (await api.get('/compliance/profiles')).data,
  });

  if (isLoading || !sh) return <div className="p-6 text-sm text-slate-400">Loading…</div>;
  const stepIdx = Math.max(0, TRACK_STEPS.indexOf(sh.trackingStatus));
  const buyer = sh.contract?.buyer;
  const allDocs: any[] = sh.documents ?? [];
  const applicableDocs = allDocs.filter((d: any) => d.status !== 'NotApplicable');
  const retractedDocs = allDocs.filter((d: any) => d.status === 'NotApplicable');

  return (
    <div>
      <Link to="/shipments" className="mb-3 inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-800">
        <ArrowLeft size={15} /> Shipments
      </Link>

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          {/* Tracking header */}
          <Card className="p-5">
            <div className="flex items-start justify-between">
              <div>
                <div className="text-xs text-slate-400">Tracking ID</div>
                <div className="flex items-center gap-2">
                  <span className="text-lg font-semibold text-slate-900">{sh.trackingNo ?? sh.code}</span>
                  <button
                    onClick={() => navigator.clipboard?.writeText(sh.trackingNo ?? sh.code)}
                    className="rounded p-1 text-slate-400 hover:bg-slate-100"
                  >
                    <Copy size={14} />
                  </button>
                </div>
              </div>
              <span className={`rounded-full px-3 py-1 text-xs font-semibold ${stepIdx === 2 ? 'bg-emerald-50 text-emerald-700' : 'bg-copper-100 text-copper-700'}`}>
                {sh.trackingStatus}
              </span>
            </div>

            {/* Horizontal tracking stepper */}
            <div className="mt-7 flex items-center">
              {TRACK_STEPS.map((s, i) => (
                <div key={s} className="flex flex-1 items-center last:flex-none">
                  <div className="flex flex-col items-center gap-2">
                    <span className={`grid h-8 w-8 place-items-center rounded-full border-2 ${i <= stepIdx ? 'border-copper-500 bg-copper-500 text-white' : 'border-slate-200 bg-white text-slate-300'}`}>
                      {i <= stepIdx ? <CheckCircle2 size={16} /> : <span className="h-2 w-2 rounded-full bg-slate-300" />}
                    </span>
                    <span className={`whitespace-nowrap text-[11px] font-medium ${i <= stepIdx ? 'text-slate-700' : 'text-slate-400'}`}>{s}</span>
                  </div>
                  {i < TRACK_STEPS.length - 1 && (
                    <div className={`mx-2 mb-5 h-0.5 flex-1 ${i < stepIdx ? 'bg-copper-500' : 'bg-slate-200'}`} />
                  )}
                </div>
              ))}
            </div>

            <Button className="mt-6 w-full" onClick={() => { setForm({ status: stepIdx === 0 ? 'In Transit' : 'Delivered', location: '', note: '' }); setOpen(true); }}>
              <Truck size={16} /> Add tracking update
            </Button>
          </Card>

          {/* Delivery details */}
          <Card className="p-5">
            <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-800">
              <Package size={16} className="text-slate-400" /> Delivery details
            </div>
            <InfoRow label="Receiver" value={sh.receiver} />
            <InfoRow label="Address" value={sh.address} />
            <InfoRow label="Contact" value={sh.contact} />
            <InfoRow label="Item" value={sh.itemDescription} />
            <InfoRow label="Mode / Port" value={`${sh.mode} · ${sh.port ?? '—'}`} />
            <InfoRow label="Container" value={sh.containerNo} />
            <InfoRow label="Note" value={sh.note ? <span className="text-rose-600">{sh.note}</span> : '—'} />
          </Card>

          {/* Timeline */}
          <Card className="p-5">
            <div className="mb-4 text-sm font-semibold text-slate-800">Tracking timeline</div>
            <ol className="relative space-y-5 border-l border-slate-100 pl-5">
              {sh.events?.map((e: any) => (
                <li key={e.id} className="relative">
                  <span className="absolute -left-[27px] grid h-6 w-6 place-items-center rounded-full bg-emerald-50 text-emerald-600">
                    <CheckCircle2 size={13} />
                  </span>
                  <div className="text-sm font-medium text-slate-800">
                    {new Date(e.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </div>
                  <div className="text-xs text-slate-400">{new Date(e.createdAt).toLocaleDateString()}</div>
                  <div className="mt-1 text-sm text-slate-600">
                    {e.note ?? `Status: ${e.status}`}{e.location ? ` — ${e.location}` : ''}
                  </div>
                </li>
              ))}
              {!sh.events?.length && <p className="text-xs text-slate-400">No tracking updates yet.</p>}
            </ol>
          </Card>
        </div>

        {/* Sidebar */}
        <div className="space-y-4">
          <Card className="p-5">
            <div className="mb-3 text-sm font-semibold text-slate-800">Buyer</div>
            <CustomerCard buyer={buyer} />
            {buyer?.email && (
              <div className="mt-3 flex gap-2">
                <a href={`mailto:${buyer.email}`} className="btn-ghost flex-1"><MessageCircle size={15} /> Email</a>
                {buyer.phone && <a href={`tel:${buyer.phone}`} className="btn-ghost flex-1"><Phone size={15} /> Call</a>}
              </div>
            )}
          </Card>

          <Card className="p-5">
            <div className="mb-1 text-sm font-semibold text-slate-800">Shipment status</div>
            <div className="mb-3"><StatusPill status={sh.status} /></div>
            <div className="space-y-1">
              {['Preparing', 'Docs Ready', 'Cleared', 'Shipped', 'Delivered'].map((s) => (
                <button
                  key={s}
                  onClick={async () => { await api.patch(`/shipments/${id}/status`, { status: s }); qc.invalidateQueries({ queryKey: ['shipment', `/shipments/${id}`] }); }}
                  className={`flex w-full items-center justify-between rounded-lg px-3 py-2 text-sm ${sh.status === s ? 'bg-brand-50 font-medium text-brand-700' : 'text-slate-600 hover:bg-slate-50'}`}
                >
                  {s}
                  {sh.status === s && <CheckCircle2 size={15} />}
                </button>
              ))}
            </div>
          </Card>

          <Card className="p-5">
            {/* Destination drives this list, so it is editable here rather than fixed at creation. */}
            <div className="mb-3 flex items-start justify-between gap-3">
              <div>
                <div className="text-sm font-semibold text-slate-800">Export documents</div>
                <div className="text-xs text-slate-400">
                  Required for {sh.destinationCountryName ?? 'an unspecified destination'} ·{' '}
                  {sh.summary?.ready ?? 0} of {sh.summary?.total ?? 0} ready
                  {sh.summary?.unverified ? ` · ${sh.summary.unverified} need checking` : ''}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Select
                  value={sh.destinationCountryCode ?? ''}
                  onChange={(e) => setDestination(e.target.value)}
                  className="h-8 w-auto text-xs"
                >
                  <option value="">Destination —</option>
                  {profiles?.map((p: any) => (
                    <option key={p.countryCode} value={p.countryCode}>
                      {p.countryName}
                    </option>
                  ))}
                </Select>
                <Button variant="ghost" onClick={reapply} className="h-8 text-xs">
                  <RefreshCw size={13} className={applying ? 'animate-spin' : ''} /> Re-check
                </Button>
              </div>
            </div>

            {sh.summary && sh.summary.total > 0 && (
              <div className="mb-3 h-1.5 overflow-hidden rounded-full bg-slate-100">
                <div
                  className="h-full rounded-full bg-brand-600 transition-all"
                  style={{ width: `${Math.round(((sh.summary.ready ?? 0) / sh.summary.total) * 100)}%` }}
                />
              </div>
            )}

            <div className="space-y-1.5">
              {applicableDocs.map((d: any) => (
                <div
                  key={d.id}
                  className={`rounded-lg border px-3 py-2 ${
                    d.status === 'NotApplicable'
                      ? 'border-slate-100 bg-slate-50 opacity-60'
                      : d.mandatory
                        ? 'border-slate-200'
                        : 'border-dashed border-slate-200'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="text-xs font-medium text-slate-700">{d.docType}</span>
                        {d.mandatory ? (
                          <span className="text-[10px] font-semibold uppercase text-brand-700">required</span>
                        ) : (
                          <span className="text-[10px] font-semibold uppercase text-slate-400">conditional</span>
                        )}
                        <VerificationBadge status={d.verificationStatus} />
                        <IssuerBadge type={d.issuerType} />
                      </div>
                      {d.authority && (
                        <div className="mt-0.5 text-[11px] text-slate-400">
                          {d.authority}
                          {d.validUntil ? ` · target by ${new Date(d.validUntil).toLocaleDateString()}` : ''}
                          {d.reference ? ` · ref ${d.reference}` : ''}
                        </div>
                      )}
                      {d.companyDocSnapshot && (
                        <div className="mt-0.5 text-[11px] text-emerald-700">
                          using company document {d.companyDocSnapshot.number}
                          {d.companyDocSnapshot.expiresAt
                            ? ` (expires ${new Date(d.companyDocSnapshot.expiresAt).toLocaleDateString()})`
                            : ''}
                        </div>
                      )}
                      {d.officialUrl && (
                        <a
                          href={d.officialUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="mt-0.5 inline-flex items-center gap-1 text-[11px] text-brand-700 hover:underline"
                        >
                          <ExternalLink size={10} /> authority source
                        </a>
                      )}
                    </div>
                    <select
                      className="h-8 shrink-0 rounded-md border border-slate-200 bg-white px-2 text-xs"
                      value={d.status}
                      onChange={(e) => setDoc(d.id, e.target.value)}
                    >
                      {['Pending', 'InProgress', 'Ready', 'Submitted', 'Rejected', 'NotApplicable'].map((s) => (
                        <option key={s}>{s}</option>
                      ))}
                    </select>
                  </div>
                </div>
              ))}
              {retractedDocs.length > 0 && (
                <details className="mt-2 text-xs">
                  <summary className="cursor-pointer text-slate-400">
                    {retractedDocs.length} document(s) no longer required for this destination
                  </summary>
                  <div className="mt-1.5 space-y-1 pl-2">
                    {retractedDocs.map((d: any) => (
                      <div key={d.id} className="text-slate-400 line-through">
                        {d.docType}
                      </div>
                    ))}
                  </div>
                </details>
              )}
            </div>

            {/* Company documents are held once and referenced, never copied per shipment. */}
            {sh.companyDocuments?.length > 0 && (
              <div className="mt-4 border-t border-slate-100 pt-3">
                <div className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-slate-700">
                  <Building2 size={13} className="text-slate-400" />
                  Company documents this shipment relies on
                </div>
                <div className="space-y-1">
                  {sh.companyDocuments.map((c: any) => (
                    <div key={c.requirementId} className="flex items-center gap-2 text-xs">
                      <span className="text-slate-600">{c.documentType}</span>
                      <VerificationBadge status={c.verificationStatus} />
                      {c.held ? (
                        <span className="text-emerald-700">
                          {c.held.number}
                          {c.held.expiresAt ? ` · exp ${new Date(c.held.expiresAt).toLocaleDateString()}` : ''}
                        </span>
                      ) : (
                        <span className="text-amber-700">not on file</span>
                      )}
                      <span className="ml-auto text-slate-400">{c.authority}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </Card>

          {/* EUDR is a separate module, not a checkbox on the checklist. */}
          {(sh.destinationMarket === 'EU' || sh.eudr) && (
            <EudrPanel shipment={sh} />
          )}

          <Card className="p-5"><ActivityFeed entity="Shipment" entityId={id} /></Card>
        </div>
      </div>

      <Modal open={open} onClose={() => setOpen(false)} title="Add tracking update">
        <form
          onSubmit={(e) => { e.preventDefault(); track.mutate(form); }}
          className="space-y-4"
        >
          <Field label="Status">
            <Select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>
              {TRACK_STEPS.map((s) => <option key={s}>{s}</option>)}
            </Select>
          </Field>
          <Field label="Location"><Input value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} placeholder="e.g. Djibouti port" /></Field>
          <Field label="Note"><Input value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} placeholder="e.g. Container loaded" /></Field>
          <div className="flex justify-end gap-2 pt-1">
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
            <Button type="submit">Save update</Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
