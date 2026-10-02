import { useState } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
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
  Printer,
  ChevronDown,
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
} from '@/components/ui';
import { DataTable } from '@/components/DataTable';
import { InfoRow, CustomerCard, SentEmails, ActivityFeed, CustomerHistory } from '@/components/detail';
import { api } from '@/lib/api';
import { downloadPdf, openPdf, invoiceDocPath, proformaDocPath } from '@/lib/download';
import { formatMoney, formatKg } from '@madda/shared';

/**
 * Ship a commercial invoice.
 *
 * Creates the shipment against the invoice and navigates straight to it, so the
 * invoice is the single place a consignment is dispatched from. The form is
 * deliberately empty of commercial detail: the buyer, destination and document
 * pack all come from the invoice, and the request only needs to record what
 * physically moves.
 */
function CreateShipmentButton({
  invoiceId,
  invoiceCode,
  onCreated,
}: {
  invoiceId: string;
  invoiceCode: string;
  onCreated: (shipmentId: string) => void;
}) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    date: new Date().toISOString().slice(0, 10),
    mode: 'Sea',
    port: 'Djibouti',
    containerNo: '',
  });
  const [error, setError] = useState('');

  const create = useMutation({
    mutationFn: async () =>
      (
        await api.post('/shipments', {
          commercialInvoiceId: invoiceId,
          date: new Date(form.date).toISOString(),
          mode: form.mode,
          port: form.port || null,
          containerNo: form.containerNo || null,
        })
      ).data,
    onSuccess: (shipment: any) => {
      qc.invalidateQueries({ queryKey: ['commercial-invoice', `/commercial-invoices/${invoiceId}`] });
      qc.invalidateQueries({ queryKey: ['shipments'] });
      setOpen(false);
      onCreated(shipment.id);
    },
    onError: (e: any) => {
      setError(e?.response?.data?.message ?? 'Could not create the shipment. Try again.');
    },
  });

  return (
    <>
      <Button onClick={() => setOpen(true)}>
        <Truck size={15} /> Create shipment
      </Button>

      <Modal open={open} onClose={() => setOpen(false)} title={`Ship ${invoiceCode}`}>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            setError('');
            create.mutate();
          }}
          className="space-y-3"
        >
          <div className="rounded-lg bg-slate-50 p-3 text-xs text-slate-500">
            The shipment takes its buyer, destination and export documents from invoice{' '}
            <span className="font-medium text-slate-700">{invoiceCode}</span>. This form records only the
            physical movement.
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Dispatch date">
              <Input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} required />
            </Field>
            <Field label="Mode">
              <Select value={form.mode} onChange={(e) => setForm({ ...form, mode: e.target.value })}>
                <option>Sea</option>
                <option>Air</option>
              </Select>
            </Field>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Port / airport">
              <Input value={form.port} onChange={(e) => setForm({ ...form, port: e.target.value })} placeholder="Djibouti" />
            </Field>
            <Field label="Container no." hint="Optional">
              <Input value={form.containerNo} onChange={(e) => setForm({ ...form, containerNo: e.target.value })} />
            </Field>
          </div>

          {error && <p className="text-xs text-rose-600">{error}</p>}

          <div className="flex justify-end gap-2 pt-1">
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={create.isPending}>
              {create.isPending ? <RefreshCw size={14} className="animate-spin" /> : <Truck size={15} />}
              Create shipment
            </Button>
          </div>
        </form>
      </Modal>
    </>
  );
}

function useDetail(key: string, url: string) {
  return useQuery({ queryKey: [key, url], queryFn: async () => (await api.get(url)).data });
}

/**
 * The export document pack.
 *
 * Anchored on the commercial invoice: the invoice is what the bank, customs and
 * the buyer key on, and it is produced by the proforma conversion that starts
 * the documentation work. A shipment shows the same pack read-only.
 */
/**
 * The export document pack.
 *
 * Anchored on the commercial invoice: the invoice is what the bank, customs and
 * the buyer key on, and it is produced by the proforma conversion that starts
 * the documentation work. A shipment shows the same pack read-only.
 *
 * Kept deliberately quiet. The earlier version put a badge for every attribute
 * on every row — verification, issuer, submission method, authority, legal
 * basis — which made a twelve-line checklist hard to scan. The row now states
 * what the document is and whether it is done; provenance is one click away,
 * and a verification badge appears only when something is unconfirmed.
 */
function DocumentPackPanel({
  invoice,
  invalidate,
  canEdit = true,
}: {
  invoice: any;
  invalidate: () => void;
  canEdit?: boolean;
}) {
  const qc = useQueryClient();
  const [busy, setBusy] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);

  const { data: profiles } = useQuery({
    queryKey: ['compliance', 'profiles'],
    queryFn: async () => (await api.get('/compliance/profiles')).data,
  });

  if (!invoice) {
    return (
      <Card className="p-5">
        <div className="text-sm font-semibold text-slate-800">Export documents</div>
        <div className="mt-2 rounded-lg bg-slate-50 p-3 text-xs text-slate-500">
          Export documents are prepared once the proforma is converted to a commercial invoice.
          Convert the proforma to create the invoice and its document pack.
        </div>
      </Card>
    );
  }

  const setDestination = async (countryCode: string) => {
    setBusy(true);
    try {
      await api.patch(`/commercial-invoices/${invoice.id}/compliance/destination`, {
        destinationCountryCode: countryCode || null,
        productForm: invoice.productForm ?? 'Green',
      });
      invalidate();
      qc.invalidateQueries({ queryKey: ['commercial'] });
    } finally {
      setBusy(false);
    }
  };

  const reapply = async () => {
    setBusy(true);
    try {
      await api.post(`/commercial-invoices/${invoice.id}/compliance/apply`, { regenerate: false });
      invalidate();
    } finally {
      setBusy(false);
    }
  };

  const setDoc = async (docId: string, status: string) => {
    await api.patch(`/shipments/documents/${docId}`, { status });
    invalidate();
  };

  const all: any[] = invoice.documents ?? [];
  const applicable = all.filter((d) => d.status !== 'NotApplicable');
  const retracted = all.filter((d) => d.status === 'NotApplicable');
  const summary = invoice.summary;
  const pct = summary?.total ? Math.round((summary.ready / summary.total) * 100) : 0;

  // Grouping by who has to act is the one piece of structure worth keeping: it
  // separates the documents we produce from the ones we are waiting on someone
  // else to issue.
  const wePrepare = applicable.filter((d) => d.issuerType === 'ERP_GENERATED');
  const othersIssue = applicable.filter((d) => d.issuerType !== 'ERP_GENERATED');

  const row = (d: any) => {
    const done = d.status === 'Ready' || d.status === 'Submitted';
    const isOpen = expanded === d.id;
    const needsCheck = d.verificationStatus && d.verificationStatus !== 'VERIFIED';
    const issuer =
      d.issuerType === 'ERP_GENERATED'
        ? 'We generate'
        : d.issuerType === 'AUTHORITY_ISSUED'
          ? 'Authority issues'
          : 'Third party';
    const due = d.validUntil ? new Date(d.validUntil).toLocaleDateString([], { day: 'numeric', month: 'short' }) : null;

    return (
      <div key={d.id} className="border-b border-slate-100 last:border-0">
        <div className="flex items-center gap-2.5 py-2">
          <span
            className={`h-2 w-2 shrink-0 rounded-full ${
              done ? 'bg-emerald-500' : d.status === 'InProgress' ? 'bg-amber-400' : 'bg-slate-300'
            }`}
            title={d.status}
          />

          <button onClick={() => setExpanded(isOpen ? null : d.id)} className="min-w-0 flex-1 text-left">
            <span className="flex items-center gap-1.5">
              <span className={`truncate text-sm ${done ? 'text-slate-500' : 'text-slate-700'}`}>{d.docType}</span>
              {!d.mandatory && <span className="shrink-0 text-[10px] text-slate-400">if applicable</span>}
              {needsCheck && <VerificationBadge status={d.verificationStatus} />}
            </span>
            <span className="block truncate text-[11px] text-slate-400">
              {issuer}
              {d.authority && d.issuerType !== 'ERP_GENERATED' ? ` · ${d.authority}` : ''}
              {due ? ` · target ${due}` : ''}
            </span>
          </button>

          <select
            className={`h-7 shrink-0 rounded-md border-0 bg-slate-50 px-2 text-xs ${
              done ? 'text-emerald-700' : 'text-slate-600'
            }`}
            value={d.status}
            onChange={(e) => setDoc(d.id, e.target.value)}
          >
            {['Pending', 'InProgress', 'Ready', 'Submitted', 'Rejected', 'NotApplicable'].map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>

          <button
            title="Download PDF"
            onClick={() =>
              downloadPdf(
                invoiceDocPath(invoice.id, d.docType),
                `${invoice.code}-${d.docType.toLowerCase().replace(/[^a-z0-9]+/g, '-')}.pdf`,
              )
            }
            className="shrink-0 rounded p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
          >
            <Download size={15} />
          </button>
          <button
            onClick={() => setExpanded(isOpen ? null : d.id)}
            className="shrink-0 rounded p-1.5 text-slate-300 hover:bg-slate-100 hover:text-slate-600"
          >
            <ChevronDown size={15} className={isOpen ? 'rotate-180 transition' : 'transition'} />
          </button>
        </div>

        {isOpen && (
          <div className="mb-2 ml-4 space-y-2 rounded-lg bg-slate-50 px-3 py-2.5 text-xs text-slate-600">
            {d.notes && !d.notes.startsWith('Not triggered') && <p>{d.notes}</p>}
            <dl className="grid gap-x-6 gap-y-1.5 sm:grid-cols-2">
              <div>
                <dt className="text-slate-400">Issued by</dt>
                <dd>{d.authority ?? '—'}</dd>
              </div>
              {d.legalBasis && (
                <div>
                  <dt className="text-slate-400">Legal basis</dt>
                  <dd>{d.legalBasis}</dd>
                </div>
              )}
              {d.reference && (
                <div>
                  <dt className="text-slate-400">Reference</dt>
                  <dd className="font-mono">{d.reference}</dd>
                </div>
              )}
              {d.companyDocSnapshot && (
                <div>
                  <dt className="text-slate-400">Company document used</dt>
                  <dd className="text-emerald-700">{d.companyDocSnapshot.number}</dd>
                </div>
              )}
              <div>
                <dt className="text-slate-400">Verification</dt>
                <dd className="flex items-center gap-1.5">
                  <VerificationBadge status={d.verificationStatus} />
                  {d.verificationSource && (
                    <a href={d.verificationSource} target="_blank" rel="noreferrer" className="text-brand-700 hover:underline">
                      source
                    </a>
                  )}
                </dd>
              </div>
            </dl>
            {d.notes?.startsWith('Not triggered') && <p className="text-amber-700">{d.notes}</p>}
            <div className="flex gap-3 pt-0.5">
              <button
                onClick={() => openPdf(invoiceDocPath(invoice.id, d.docType, true))}
                className="inline-flex items-center gap-1 text-brand-700 hover:underline"
              >
                <Printer size={12} /> Print
              </button>
              {d.officialUrl && (
                <a href={d.officialUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-brand-700 hover:underline">
                  <ExternalLink size={12} /> Authority source
                </a>
              )}
            </div>
          </div>
        )}
      </div>
    );
  };

  return (
    <Card className="p-5">
      <div className="mb-3 flex items-start justify-between gap-3">
        <div>
          <div className="text-sm font-semibold text-slate-800">Export documents</div>
          <div className="text-xs text-slate-400">
            {invoice.destinationCountryName ?? 'No destination set'}
            {summary ? ` · ${summary.ready} of ${summary.total} ready` : ''}
            {summary?.unverified ? ` · ${summary.unverified} to confirm` : ''}
          </div>
        </div>
        {canEdit && (
          <div className="flex items-center gap-2">
            <Select
              value={invoice.destinationCountryCode ?? ''}
              onChange={(e) => setDestination(e.target.value)}
              className="h-8 w-auto text-xs"
              disabled={busy}
            >
              <option value="">Destination —</option>
              {profiles?.map((p: any) => (
                <option key={p.countryCode} value={p.countryCode}>
                  {p.countryName}
                </option>
              ))}
            </Select>
            <Button variant="ghost" onClick={reapply} className="h-8 text-xs" disabled={busy}>
              <RefreshCw size={13} className={busy ? 'animate-spin' : ''} />
            </Button>
          </div>
        )}
      </div>

      {summary && summary.total > 0 && (
        <div className="mb-3 h-1.5 overflow-hidden rounded-full bg-slate-100">
          <div className="h-full rounded-full bg-brand-600 transition-all" style={{ width: `${pct}%` }} />
        </div>
      )}

      {applicable.length === 0 ? (
        <div className="rounded-lg bg-slate-50 p-3 text-xs text-slate-500">
          No documents resolve for this destination yet. Set a destination to build the pack.
        </div>
      ) : (
        <div className="space-y-3">
          {wePrepare.length > 0 && (
            <div>
              <div className="mb-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                We prepare
              </div>
              {wePrepare.map(row)}
            </div>
          )}
          {othersIssue.length > 0 && (
            <div>
              <div className="mb-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                Issued by an authority or third party
              </div>
              {othersIssue.map(row)}
            </div>
          )}
        </div>
      )}

      {retracted.length > 0 && (
        <details className="mt-3 text-xs">
          <summary className="cursor-pointer text-slate-400">
            {retracted.length} not required for this destination
          </summary>
          <div className="mt-1.5 space-y-0.5 pl-2">
            {retracted.map((d: any) => (
              <div key={d.id} className="text-slate-400 line-through">
                {d.docType}
              </div>
            ))}
          </div>
        </details>
      )}

      {invoice.companyDocuments?.length > 0 && (
        <div className="mt-4 border-t border-slate-100 pt-3">
          <div className="mb-1.5 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide text-slate-400">
            <Building2 size={12} /> Company documents
          </div>
          <div className="space-y-1">
            {invoice.companyDocuments.map((c: any) => (
              <div key={c.requirementId} className="flex items-center gap-2 text-xs">
                <span className={c.held ? 'text-slate-500' : 'text-slate-700'}>{c.documentType}</span>
                {c.held ? (
                  <span className="text-slate-400">
                    {c.held.number}
                    {c.held.expiresAt ? ` · exp ${new Date(c.held.expiresAt).toLocaleDateString()}` : ''}
                  </span>
                ) : (
                  <span className="text-amber-700">not on file</span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </Card>
  );
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
              <Button variant="ghost" onClick={() => openPdf(proformaDocPath(String(id), true))}><Printer size={15} /> Print</Button>
              <Button variant="ghost" onClick={() => downloadPdf(proformaDocPath(String(id)), `${pf.code}-proforma-invoice.pdf`)}><Download size={15} /> PDF</Button>
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
  const navigate = useNavigate();
  const act = async (fn: () => Promise<any>) => {
    await fn();
    qc.invalidateQueries({ queryKey: ['commercial-invoice', `/commercial-invoices/${id}`] });
    qc.invalidateQueries({ queryKey: ['commercial'] });
    qc.invalidateQueries({ queryKey: ['emails'] });
    qc.invalidateQueries({ queryKey: ['activity'] });
  };
  if (isLoading || !inv) return <div className="p-6 text-sm text-slate-400">{t('common.loading')}</div>;
  const total = inv.lines?.reduce((a: number, l: any) => a + Number(l.amount), 0) ?? 0;
  // A consignment ships against this invoice, so the shipment is reachable from
  // here. One invoice can have more than one shipment, so this links to the
  // first and points at the full list when there is more than one.
  const shipments: any[] = inv.shipments ?? [];
  const primaryShipment = shipments[0];
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
              <Button variant="ghost" onClick={() => openPdf(invoiceDocPath(String(id), 'Commercial Invoice', true))}><Printer size={15} /> Print Invoice</Button>
              <Button variant="ghost" onClick={() => downloadPdf(invoiceDocPath(String(id), 'Commercial Invoice'), `${inv.code}-commercial-invoice.pdf`)}><Download size={15} /> PDF</Button>
              {/* Ship directly from the invoice: it carries the buyer, the
                  destination and the document pack the shipment reads from. */}
              {primaryShipment ? (
                <Link to={`/shipments/${primaryShipment.id}`}>
                  <Button variant="ghost">
                    <Truck size={15} />
                    {shipments.length > 1 ? `Shipments (${shipments.length})` : 'Open shipment'}
                  </Button>
                </Link>
              ) : (
                <CreateShipmentButton
                  invoiceId={String(id)}
                  invoiceCode={inv.code}
                  onCreated={(shipmentId) => navigate(`/shipments/${shipmentId}`)}
                />
              )}
            </div>
          </Card>
          <Card className="p-5">
            <h3 className="mb-3 text-sm font-semibold text-slate-700">Line items</h3>
            <DataTable columns={columns} rows={inv.lines ?? []} />
            <div className="mt-4 flex justify-end text-sm font-semibold text-slate-900">Total: {formatMoney(total, inv.currency)}</div>
          </Card>

          {/* The document pack belongs to the invoice, so it is managed here. */}
          <DocumentPackPanel invoice={inv} invalidate={() => act(async () => {})} />
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

  if (isLoading || !sh) return <div className="p-6 text-sm text-slate-400">Loading…</div>;
  const stepIdx = Math.max(0, TRACK_STEPS.indexOf(sh.trackingStatus));
  // Buyer and destination come from the linked commercial invoice.
  const buyer = sh.commercialInvoice?.buyer;

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

          {/* The pack is owned by the commercial invoice; this is a read-through. */}
          <DocumentPackPanel
            invoice={sh.commercialInvoice}
            invalidate={() => {
              qc.invalidateQueries({ queryKey: ['shipment', `/shipments/${id}`] });
              qc.invalidateQueries({ queryKey: ['shipments'] });
            }}
            canEdit={false}
          />

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
