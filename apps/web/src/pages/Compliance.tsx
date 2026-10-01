import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Globe2,
  ShieldCheck,
  FileWarning,
  Building2,
  AlertTriangle,
  ExternalLink,
  RefreshCw,
  MapPin,
  Scale,
} from 'lucide-react';
import { api } from '@/lib/api';
import { PageHeader } from '@/components/PageHeader';
import {
  Card,
  StatCard,
  Button,
  Field,
  Input,
  Select,
  Modal,
  EmptyState,
  VerificationBadge,
  IssuerBadge,
  SubmissionBadge,
  StatusPill,
} from '@/components/ui';

type Tab = 'markets' | 'requirements' | 'company' | 'verification';

const SCOPE_LABEL: Record<string, string> = {
  COMPANY: 'Company',
  SHARED: 'Shared',
  SHIPMENT: 'Shipment',
  LOT: 'Lot',
  GOODS: 'Goods',
  DEST: 'Destination',
};

const MATCH_LABEL: Record<string, string> = {
  COUNTRY: 'This country',
  MARKET_BLOCK: 'Market block',
  UNIVERSAL: 'All destinations',
};

/** One requirement row, with authority, verification and trigger detail. */
function RequirementRow({ r, showScope }: { r: any; showScope?: boolean }) {
  const [open, setOpen] = useState(false);
  const unmet: string[] = r.unmet ?? [];

  return (
    <div className="border-b border-slate-100 last:border-0">
      <button
        onClick={() => setOpen(!open)}
        className="flex w-full items-start gap-3 px-4 py-3 text-left hover:bg-slate-50"
      >
        <span
          className={
            r.mandatory
              ? 'mt-0.5 h-2 w-2 shrink-0 rounded-full bg-brand-600'
              : 'mt-0.5 h-2 w-2 shrink-0 rounded-full border border-slate-300'
          }
          title={r.mandatory ? 'Mandatory' : r.conditional ? 'Conditional' : 'Optional'}
        />
        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-medium text-slate-800">{r.name}</span>
            {r.mandatory && (
              <span className="text-[10px] font-semibold uppercase tracking-wide text-brand-700">Required</span>
            )}
            {r.conditional && !r.mandatory && (
              <span className="text-[10px] font-semibold uppercase tracking-wide text-amber-700">Conditional</span>
            )}
            <VerificationBadge status={r.verificationStatus} />
            <IssuerBadge type={r.issuerType} />
            <SubmissionBadge method={r.submissionMethod} />
            {r.appliesToImporter && (
              <span
                title="Filed or actioned by the buyer, not by us. We supply the data."
                className="inline-flex items-center rounded bg-sky-50 px-1.5 py-0.5 text-[10px] font-medium text-sky-700"
              >
                Importer files
              </span>
            )}
          </span>
          <span className="mt-1 block text-xs text-slate-500">
            {r.authority}
            {showScope && r.scope ? ` · ${SCOPE_LABEL[r.scope] ?? r.scope}` : ''}
            {r.matchScope ? ` · ${MATCH_LABEL[r.matchScope] ?? r.matchScope}` : ''}
            {r.leadTimeDays ? ` · ${r.leadTimeDays}d lead` : ''}
            {r.validityDays ? ` · valid ${r.validityDays}d` : ''}
          </span>
          {unmet.length > 0 && (
            <span className="mt-1 block text-xs text-amber-700">Not triggered: {unmet.join('; ')}</span>
          )}
          {r.needsShipmentData && (
            <span className="mt-1 block text-xs text-slate-400">
              Depends on shipment value or lot quality — resolves once lots are attached.
            </span>
          )}
        </span>
      </button>

      {open && (
        <div className="space-y-3 bg-slate-50 px-4 py-3 text-xs text-slate-600">
          <p className="leading-relaxed text-slate-700">{r.description}</p>
          {r.notes && <p className="leading-relaxed text-slate-500">{r.notes}</p>}
          <dl className="grid gap-1.5 sm:grid-cols-2">
            {r.legalBasis && (
              <div>
                <dt className="font-medium text-slate-500">Legal basis</dt>
                <dd>{r.legalBasis}</dd>
              </div>
            )}
            <div>
              <dt className="font-medium text-slate-500">Document type</dt>
              <dd>{r.documentType}</dd>
            </div>
            <div>
              <dt className="font-medium text-slate-500">Requirement class</dt>
              <dd>{r.requirementType}</dd>
            </div>
            <div>
              <dt className="font-medium text-slate-500">Applies to</dt>
              <dd>{r.scope ? (SCOPE_LABEL[r.scope] ?? r.scope) : '—'}</dd>
            </div>
          </dl>
          <div className="flex flex-wrap gap-3 pt-1">
            {r.officialUrl && (
              <a
                href={r.officialUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 text-brand-700 hover:underline"
              >
                <ExternalLink size={12} /> Authority source
              </a>
            )}
            {r.verificationSource && r.verificationSource !== r.officialUrl && (
              <a
                href={r.verificationSource}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 text-brand-700 hover:underline"
              >
                <ExternalLink size={12} /> Verification source
              </a>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * Compliance hub: which requirements apply to which destination, what is
 * verified, and which company documents we hold.
 *
 * The page exists to make the difference between a confirmed requirement and an
 * assumption visible at a glance. Requirements without a source are listed, but
 * badged, so nobody ships on a guess.
 */
export function CompliancePage() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [tab, setTab] = useState<Tab>('markets');
  const [country, setCountry] = useState('DE');
  const [form, setForm] = useState('Green');
  const [reqFilter, setReqFilter] = useState('');
  const [addOpen, setAddOpen] = useState(false);

  const { data: profiles } = useQuery({
    queryKey: ['compliance', 'profiles'],
    queryFn: async () => (await api.get('/compliance/profiles')).data,
  });

  const { data: preview } = useQuery({
    queryKey: ['compliance', 'preview', country, form],
    queryFn: async () => (await api.get(`/compliance/preview?country=${country}&form=${form}`)).data,
  });

  const { data: requirements } = useQuery({
    queryKey: ['compliance', 'requirements'],
    queryFn: async () => (await api.get('/compliance/requirements')).data,
  });

  const { data: company } = useQuery({
    queryKey: ['compliance', 'company'],
    queryFn: async () => (await api.get('/compliance/company-documents')).data,
  });

  const { data: verification } = useQuery({
    queryKey: ['compliance', 'verification'],
    queryFn: async () => (await api.get('/compliance/verification')).data,
  });

  const { data: templates } = useQuery({
    queryKey: ['compliance', 'templates'],
    queryFn: async () => (await api.get('/compliance/templates')).data,
  });

  const addDoc = useMutation({
    mutationFn: async (body: any) => (await api.post('/compliance/company-documents', body)).data,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['compliance'] });
      setAddOpen(false);
    },
  });

  const filteredReqs = (requirements ?? []).filter((r: any) => {
    if (!reqFilter) return true;
    const q = reqFilter.toLowerCase();
    return (
      r.name?.toLowerCase().includes(q) ||
      r.documentType?.toLowerCase().includes(q) ||
      r.authority?.toLowerCase().includes(q) ||
      r.countryCode?.toLowerCase().includes(q)
    );
  });

  const heldTypes = new Set((company?.documents ?? []).map((d: any) => d.docType));

  return (
    <div>
      <PageHeader title="Country Compliance" subtitle="Requirements by destination, with source and verification status" />

      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Markets profiled" value={profiles?.length ?? '—'} icon={<Globe2 size={18} />} />
        <StatCard
          label="Requirements"
          value={verification?.requirements?.total ?? '—'}
          icon={<Scale size={18} />}
        />
        <StatCard
          label="Verified"
          value={verification?.requirements?.byStatus?.VERIFIED ?? 0}
          trend={
            verification?.requirements?.total
              ? `${Math.round(((verification.requirements.byStatus?.VERIFIED ?? 0) / verification.requirements.total) * 100)}% confirmed`
              : undefined
          }
          icon={<ShieldCheck size={18} />}
        />
        <StatCard
          label="Needs checking"
          value={(verification?.requirements?.byStatus?.NEEDS_LOCAL_CHECK ?? 0) + (verification?.requirements?.byStatus?.UNVERIFIED ?? 0)}
          icon={<FileWarning size={18} />}
        />
      </div>

      {verification?.unsourced?.length > 0 && (
        <div className="mb-4 flex items-start gap-2.5 rounded-lg bg-amber-50 p-3 ring-1 ring-amber-600/15">
          <AlertTriangle size={16} className="mt-0.5 shrink-0 text-amber-700" />
          <div className="text-xs text-amber-900">
            <span className="font-semibold">
              {verification.unsourced.length} requirement(s) have no official source recorded
            </span>
            <p className="mt-0.5 text-amber-800">
              {verification.unsourced.map((u: any) => u.name).join(', ')}. These are assumptions, not confirmed
              legal requirements — verify them before relying on them.
            </p>
          </div>
        </div>
      )}

      <div className="mb-4 flex gap-1 border-b border-slate-200">
        {(
          [
            ['markets', 'Destinations'],
            ['requirements', 'All requirements'],
            ['company', 'Company documents'],
            ['verification', 'Templates & audit'],
          ] as [Tab, string][]
        ).map(([key, label]) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={
              tab === key
                ? 'border-b-2 border-brand-600 px-3 py-2 text-sm font-medium text-brand-800'
                : 'border-b-2 border-transparent px-3 py-2 text-sm text-slate-500 hover:text-slate-700'
            }
          >
            {label}
          </button>
        ))}
      </div>

      {tab === 'markets' && (
        <div className="space-y-4">
          <Card className="p-4">
            <div className="grid gap-3 sm:grid-cols-3">
              <Field label="Destination country">
                <Select value={country} onChange={(e) => setCountry(e.target.value)}>
                  {(profiles ?? []).map((p: any) => (
                    <option key={p.countryCode} value={p.countryCode}>
                      {p.countryName} ({p.countryCode})
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Product form">
                <Select value={form} onChange={(e) => setForm(e.target.value)}>
                  {['Green', 'Roasted', 'Soluble', 'Liquid'].map((f) => (
                    <option key={f}>{f}</option>
                  ))}
                </Select>
              </Field>
              <div className="flex items-end">
                <div className="w-full rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-600">
                  <div className="text-slate-400">HS code</div>
                  <div className="font-mono text-sm font-semibold text-slate-800">{preview?.hsCode ?? '—'}</div>
                </div>
              </div>
            </div>

            {preview?.destination && (
              <div className="mt-3 flex flex-wrap items-center gap-2 rounded-lg bg-slate-50 p-3 text-xs text-slate-600">
                <MapPin size={14} className="text-slate-400" />
                <span className="font-medium text-slate-700">{preview.destination.countryName}</span>
                <StatusPill status={preview.destination.market} />
                <VerificationBadge status={preview.destination.verificationStatus} />
                {preview.destination.verificationSource && (
                  <a
                    href={preview.destination.verificationSource}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 text-brand-700 hover:underline"
                  >
                    <ExternalLink size={12} /> Source
                  </a>
                )}
                {preview.destination.notes && (
                  <span className="text-slate-500">{preview.destination.notes}</span>
                )}
              </div>
            )}
          </Card>

          <Card>
            <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
              <div>
                <h3 className="text-sm font-semibold text-slate-700">
                  Required for {preview?.destination?.countryName ?? 'this destination'}
                </h3>
                <p className="text-xs text-slate-400">
                  {preview?.requirements?.length ?? 0} items · {preview?.verifiedCount ?? 0} verified ·{' '}
                  {preview?.unverifiedCount ?? 0} need checking
                </p>
              </div>
              <span className="text-xs text-slate-400">
                Origin-side + destination-side + product-specific
              </span>
            </div>
            {(preview?.requirements ?? []).map((r: any) => (
              <RequirementRow key={r.requirementId} r={r} />
            ))}
            {!preview?.requirements?.length && <EmptyState title="No requirements resolve for this destination" />}
          </Card>

          {preview?.companyRequirements?.length > 0 && (
            <Card>
              <div className="flex items-center gap-2 border-b border-slate-200 px-4 py-3">
                <Building2 size={15} className="text-slate-400" />
                <h3 className="text-sm font-semibold text-slate-700">Company-level requirements</h3>
                <span className="text-xs text-slate-400">held once, not copied per shipment</span>
              </div>
              {preview.companyRequirements.map((r: any) => (
                <div key={r.requirementId} className="flex items-center gap-3 border-b border-slate-100 px-4 py-2.5 last:border-0">
                  <span className="text-sm text-slate-700">{r.documentType}</span>
                  <VerificationBadge status={r.verificationStatus} />
                  {r.held ? (
                    <span className="text-xs text-emerald-700">
                      on file{r.number ? ` · ${r.number}` : ''}
                      {r.expiresAt ? ` · expires ${new Date(r.expiresAt).toLocaleDateString()}` : ''}
                    </span>
                  ) : (
                    <span className="text-xs text-amber-700">not on file</span>
                  )}
                  <span className="ml-auto text-xs text-slate-400">{r.authority}</span>
                </div>
              ))}
            </Card>
          )}
        </div>
      )}

      {tab === 'requirements' && (
        <Card>
          <div className="flex flex-wrap items-center gap-2 border-b border-slate-200 p-3">
            <Input
              placeholder="Search name, document, authority, country…"
              value={reqFilter}
              onChange={(e) => setReqFilter(e.target.value)}
              className="max-w-xs"
            />
            <span className="text-xs text-slate-400">{filteredReqs.length} of {requirements?.length ?? 0}</span>
          </div>
          {filteredReqs.map((r: any) => (
            <RequirementRow key={r.id} r={{ ...r, matchScope: null, unmet: [] }} showScope />
          ))}
        </Card>
      )}

      {tab === 'company' && (
        <div className="space-y-4">
          {company?.gaps?.length > 0 && (
            <div className="rounded-lg bg-rose-50 p-3 ring-1 ring-rose-600/15">
              <div className="flex items-center gap-2 text-sm font-semibold text-rose-900">
                <AlertTriangle size={15} />
                {company.gaps.length} mandatory company document(s) not on file
              </div>
              <ul className="mt-2 space-y-1.5 text-xs text-rose-800">
                {company.gaps.map((g: any) => (
                  <li key={g.requirementId}>
                    <span className="font-medium">{g.documentType}</span> — {g.authority}
                    {g.legalBasis ? ` · ${g.legalBasis}` : ''}
                    <VerificationBadge status={g.verificationStatus} className="ml-1.5" />
                  </li>
                ))}
              </ul>
            </div>
          )}

          {company?.expiring?.length > 0 && (
            <div className="rounded-lg bg-amber-50 p-3 ring-1 ring-amber-600/15">
              <div className="text-sm font-semibold text-amber-900">
                {company.expiring.length} document(s) expire within 60 days
              </div>
              <ul className="mt-1.5 space-y-1 text-xs text-amber-800">
                {company.expiring.map((d: any) => (
                  <li key={d.id}>
                    {d.title} ({d.number}) — expires {d.expiresAt ? new Date(d.expiresAt).toLocaleDateString() : 'n/a'}
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="flex justify-end">
            <Button onClick={() => setAddOpen(true)}>
              <Building2 size={14} className="mr-1.5" /> Record company document
            </Button>
          </div>

          <Card>
            <div className="border-b border-slate-200 px-4 py-3">
              <h3 className="text-sm font-semibold text-slate-700">Documents on file</h3>
              <p className="text-xs text-slate-400">
                Held once and referenced by every shipment that relies on them
              </p>
            </div>
            {(company?.documents ?? []).map((d: any) => (
              <div key={d.id} className="flex flex-wrap items-center gap-3 border-b border-slate-100 px-4 py-2.5 last:border-0">
                <span className="text-sm font-medium text-slate-700">{d.title}</span>
                <span className="font-mono text-xs text-slate-500">{d.number}</span>
                <StatusPill status={d.status} />
                {d.expiresAt && (
                  <span className="text-xs text-slate-500">
                    issued {new Date(d.issuedAt).toLocaleDateString()} · expires{' '}
                    {new Date(d.expiresAt).toLocaleDateString()}
                  </span>
                )}
                <span className="ml-auto text-xs text-slate-400">{d.issuer}</span>
              </div>
            ))}
            {!company?.documents?.length && (
              <EmptyState
                title="No company documents recorded"
                hint="Record your ECTA Certificate of Competency, trade licence, TIN and bank registration here."
              />
            )}
          </Card>

          <Card>
            <div className="border-b border-slate-200 px-4 py-3">
              <h3 className="text-sm font-semibold text-slate-700">Requirements</h3>
            </div>
            {(company?.requirements ?? []).map((r: any) => (
              <div key={r.id} className="flex items-center gap-3 border-b border-slate-100 px-4 py-2.5 last:border-0">
                <span className="text-sm text-slate-700">{r.name}</span>
                <VerificationBadge status={r.verificationStatus} />
                <IssuerBadge type={r.issuerType} />
                {heldTypes.has(r.documentType) ? (
                  <StatusPill status="Active" />
                ) : r.mandatory ? (
                  <StatusPill status="Pending" />
                ) : null}
                <span className="ml-auto text-xs text-slate-400">{r.authority}</span>
              </div>
            ))}
          </Card>
        </div>
      )}

      {tab === 'verification' && (
        <div className="space-y-4">
          <Card>
            <div className="border-b border-slate-200 px-4 py-3">
              <h3 className="text-sm font-semibold text-slate-700">Document templates</h3>
              <p className="text-xs text-slate-400">
                An official blank form is not the same as a document we generate, which is not the same as a certificate
                an authority issues
              </p>
            </div>
            <div className="hidden grid-cols-[1.6fr_1fr_1.4fr_auto] gap-3 border-b border-slate-200 px-4 py-2 text-[10px] font-semibold uppercase tracking-wide text-slate-400 sm:grid">
              <span>Document</span>
              <span>Authority</span>
              <span>Kind</span>
              <span>Source</span>
            </div>
            {(templates ?? []).map((t: any) => (
              <div key={t.id} className="grid gap-2 border-b border-slate-100 px-4 py-2.5 text-xs last:border-0 sm:grid-cols-[1.6fr_1fr_1.4fr_auto] sm:items-center sm:gap-3">
                <span className="font-medium text-slate-700">{t.documentType}</span>
                <span className="text-slate-500">{t.authority ?? '—'}</span>
                <span>
                  <span
                    className={
                      t.templateKind === 'C_AUTHORITY_ISSUED'
                        ? 'inline-block rounded bg-violet-50 px-1.5 py-0.5 text-[10px] font-medium text-violet-700'
                        : t.templateKind === 'B_ERP_GENERATED'
                          ? 'inline-block rounded bg-brand-50 px-1.5 py-0.5 text-[10px] font-medium text-brand-700'
                          : 'inline-block rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium text-slate-600'
                    }
                  >
                    {t.templateKind === 'C_AUTHORITY_ISSUED'
                      ? 'Authority issues certificate'
                      : t.templateKind === 'B_ERP_GENERATED'
                        ? 'We generate it'
                        : 'Official blank form'}
                  </span>
                  {t.notes && <span className="mt-0.5 block text-slate-400">{t.notes}</span>}
                </span>
                <span>
                  {t.officialSourceUrl && (
                    <a
                      href={t.officialSourceUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1 text-brand-700 hover:underline"
                    >
                      <ExternalLink size={12} /> {t.format}
                    </a>
                  )}
                </span>
              </div>
            ))}
          </Card>

          <Card className="p-4">
            <h3 className="mb-2 text-sm font-semibold text-slate-700">Verification health</h3>
            <p className="mb-3 text-xs text-slate-500">
              Requirements change. ECTA amended its directive in 2025 and EUDR has a 2026 application date, so each row
              carries when it was last checked against an official source. Anything older than 180 days is flagged for
              re-checking rather than being left to look authoritative.
            </p>
            <div className="grid gap-3 sm:grid-cols-2">
              {(['requirements', 'profiles'] as const).map((k) => (
                <div key={k} className="rounded-lg bg-slate-50 p-3">
                  <div className="text-xs font-medium capitalize text-slate-500">{k}</div>
                  <div className="mt-1 text-2xl font-semibold text-slate-900">{verification?.[k]?.total ?? 0}</div>
                  <div className="mt-1.5 flex flex-wrap gap-2 text-xs">
                    {Object.entries(verification?.[k]?.byStatus ?? {}).map(([status, n]) => (
                      <span key={status} className="inline-flex items-center gap-1 text-slate-600">
                        <VerificationBadge status={status} /> {n as number}
                      </span>
                    ))}
                  </div>
                  {verification?.[k]?.stale > 0 && (
                    <div className="mt-2 text-xs text-amber-700">
                      {verification[k].stale} not re-verified in 180+ days
                    </div>
                  )}
                </div>
              ))}
            </div>
          </Card>
        </div>
      )}

      <Modal open={addOpen} onClose={() => setAddOpen(false)} title="Record company document">
        <form
          onSubmit={(e: React.FormEvent<HTMLFormElement>) => {
            e.preventDefault();
            const f = new FormData(e.currentTarget);
            addDoc.mutate({
              docType: f.get('docType'),
              title: f.get('title'),
              issuer: f.get('issuer'),
              number: f.get('number'),
              issuedAt: new Date(String(f.get('issuedAt'))).toISOString(),
              expiresAt: f.get('expiresAt') ? new Date(String(f.get('expiresAt'))).toISOString() : null,
              countryCode: f.get('countryCode') || null,
            });
          }}
          className="space-y-3"
        >
          <Field label="Document type">
            <Select name="docType" required>
              {(company?.requirements ?? []).map((r: any) => (
                <option key={r.id} value={r.documentType}>
                  {r.documentType}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Title">
            <Input name="title" required placeholder="Coffee Exporter Certificate of Competency" />
          </Field>
          <Field label="Issuing authority">
            <Input name="issuer" required placeholder="Ethiopian Coffee and Tea Authority" />
          </Field>
          <Field label="Number">
            <Input name="number" required placeholder="Certificate reference" />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Issued">
              <Input type="date" name="issuedAt" required />
            </Field>
            <Field label="Expires" hint="Leave blank if it does not expire">
              <Input type="date" name="expiresAt" />
            </Field>
          </div>
          <Field label="Country code" hint="ISO-3166 alpha-2 of the issuing jurisdiction">
            <Input name="countryCode" placeholder="ET" maxLength={2} />
          </Field>
          <div className="flex justify-end gap-2 pt-1">
            <Button type="button" variant="ghost" onClick={() => setAddOpen(false)}>
              {t('common.cancel')}
            </Button>
            <Button type="submit" disabled={addDoc.isPending}>
              {addDoc.isPending ? <RefreshCw size={14} className="animate-spin" /> : null}
              {t('common.save')}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
