import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  ShieldCheck,
  FileWarning,
  Building2,
  AlertTriangle,
  ExternalLink,
  RefreshCw,
  MapPin,
  ChevronDown,
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
  StatusPill,
} from '@/components/ui';

const TABS_KEYS = ['destinations', 'company', 'reference'] as const;
type Tab = (typeof TABS_KEYS)[number];

const SCOPE_LABEL: Record<string, string> = {
  COMPANY: 'Company',
  SHARED: 'Shared',
  SHIPMENT: 'Shipment',
  LOT: 'Lot',
  GOODS: 'Goods',
  DEST: 'Destination',
};

/**
 * One requirement.
 *
 * Collapsed, this states the requirement, who it comes from, and whether it is
 * confirmed. The earlier version showed a badge for verification, issuer and
 * submission method on every row, which turned a scan into a read. Provenance
 * is one click away, and a verification badge appears only when a requirement is
 * *not* confirmed — the absence of a warning is the signal.
 */
function RequirementRow({ r, showScope }: { r: any; showScope?: boolean }) {
  const [open, setOpen] = useState(false);
  const unmet: string[] = r.unmet ?? [];
  const needsCheck = r.verificationStatus && r.verificationStatus !== 'VERIFIED';

  const meta = [
    r.authority,
    showScope && r.scope ? SCOPE_LABEL[r.scope] ?? r.scope : null,
    r.matchScope === 'COUNTRY' ? 'this country' : r.matchScope === 'MARKET_BLOCK' ? 'market-wide' : null,
    r.leadTimeDays ? `${r.leadTimeDays}d lead` : null,
    r.validityDays ? `valid ${r.validityDays}d` : null,
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    <div className="border-b border-slate-100 last:border-0">
      <button
        onClick={() => setOpen(!open)}
        className="flex w-full items-center gap-3 px-4 py-2.5 text-left hover:bg-slate-50"
      >
        <span
          className={
            r.mandatory
              ? 'h-2 w-2 shrink-0 rounded-full bg-brand-600'
              : 'h-2 w-2 shrink-0 rounded-full border border-slate-300'
          }
          title={r.mandatory ? 'Mandatory' : r.conditional ? 'Conditional' : 'Optional'}
        />
        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-center gap-1.5">
            <span className="truncate text-sm text-slate-700">{r.name}</span>
            {needsCheck && <VerificationBadge status={r.verificationStatus} />}
            {r.appliesToImporter && (
              <span
                title="Filed or actioned by the buyer. We supply the data."
                className="shrink-0 rounded bg-sky-50 px-1.5 py-0.5 text-[10px] font-medium text-sky-700"
              >
                importer files
              </span>
            )}
          </span>
          <span className="block truncate text-[11px] text-slate-400">{meta}</span>
          {unmet.length > 0 && (
            <span className="block truncate text-[11px] text-amber-700">Not triggered: {unmet.join('; ')}</span>
          )}
        </span>
        <ChevronDown size={15} className={`shrink-0 text-slate-300 transition ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="space-y-2.5 bg-slate-50 px-4 py-3 text-xs text-slate-600">
          <p className="leading-relaxed text-slate-700">{r.description}</p>
          {r.notes && <p className="leading-relaxed text-slate-500">{r.notes}</p>}
          <dl className="grid gap-x-6 gap-y-1.5 sm:grid-cols-2">
            <div>
              <dt className="text-slate-400">Issued by</dt>
              <dd>{r.authority}</dd>
            </div>
            <div>
              <dt className="text-slate-400">Document</dt>
              <dd>
                {r.documentType}
                {r.requirementType ? ` · ${r.requirementType}` : ''}
              </dd>
            </div>
            {r.legalBasis && (
              <div className="sm:col-span-2">
                <dt className="text-slate-400">Legal basis</dt>
                <dd>{r.legalBasis}</dd>
              </div>
            )}
            <div>
              <dt className="text-slate-400">Verification</dt>
              <dd className="flex items-center gap-1.5">
                <VerificationBadge status={r.verificationStatus} />
                {r.verificationSource && (
                  <a href={r.verificationSource} target="_blank" rel="noreferrer" className="text-brand-700 hover:underline">
                    source
                  </a>
                )}
              </dd>
            </div>
            {r.submissionMethod && (
              <div>
                <dt className="text-slate-400">Submission</dt>
                <dd>{r.submissionMethod}</dd>
              </div>
            )}
          </dl>
          {r.officialUrl && (
            <a
              href={r.officialUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 pt-0.5 text-brand-700 hover:underline"
            >
              <ExternalLink size={12} /> Authority source
            </a>
          )}
        </div>
      )}
    </div>
  );
}

/** Requirement list grouped by whether it is origin-side or destination-side. */
function RequirementGroups({ requirements }: { requirements: any[] }) {
  const origin = requirements.filter((r) => r.matchScope === 'UNIVERSAL');
  const destination = requirements.filter((r) => r.matchScope !== 'UNIVERSAL');
  return (
    <div className="space-y-3">
      {origin.length > 0 && (
        <div>
          <div className="px-4 pt-3 text-[10px] font-semibold uppercase tracking-wide text-slate-400">
            Ethiopian export side
          </div>
          {origin.map((r) => (
            <RequirementRow key={r.requirementId} r={r} />
          ))}
        </div>
      )}
      {destination.length > 0 && (
        <div>
          <div className="px-4 pt-3 text-[10px] font-semibold uppercase tracking-wide text-slate-400">
            Destination specific
          </div>
          {destination.map((r) => (
            <RequirementRow key={r.requirementId} r={r} />
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * Country compliance.
 *
 * Three jobs, three tabs: what a destination requires, what the company holds,
 * and the reference material behind both. The page exists to keep a confirmed
 * requirement visibly distinct from an assumption, so a verification badge
 * appears only on the rows that are not confirmed.
 */
export function CompliancePage() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  // The active tab lives in the query string so a view can be linked to or
  // bookmarked, which matters for a page people refer back to.
  const [params, setParams] = useSearchParams();
  const requested = params.get('tab') as Tab | null;
  const tab: Tab = requested && (TABS_KEYS as readonly string[]).includes(requested) ? requested : 'destinations';
  const setTab = (next: Tab) => setParams(next === 'destinations' ? {} : { tab: next }, { replace: true });
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

  const filteredReqs = useMemo(
    () =>
      (requirements ?? []).filter((r: any) => {
        if (!reqFilter) return true;
        const q = reqFilter.toLowerCase();
        return (
          r.name?.toLowerCase().includes(q) ||
          r.documentType?.toLowerCase().includes(q) ||
          r.authority?.toLowerCase().includes(q) ||
          r.countryCode?.toLowerCase().includes(q)
        );
      }),
    [requirements, reqFilter],
  );

  // Company requirements with what we hold merged in, so the same list answers
  // both "what is required" and "do we have it" rather than needing two.
  const companyRows = useMemo(() => {
    const held = new Map((company?.documents ?? []).map((d: any) => [d.docType, d]));
    return (company?.requirements ?? []).map((r: any) => ({ ...r, held: held.get(r.documentType) ?? null }));
  }, [company]);

  // Documents on file that no requirement points at, so nothing is hidden by
  // the merge above.
  const unmatchedDocs = useMemo(() => {
    const types = new Set((company?.requirements ?? []).map((r: any) => r.documentType));
    return (company?.documents ?? []).filter((d: any) => !types.has(d.docType));
  }, [company]);

  const unconfirmed =
    (verification?.requirements?.byStatus?.NEEDS_LOCAL_CHECK ?? 0) +
    (verification?.requirements?.byStatus?.UNVERIFIED ?? 0);
  const destProfile = profiles?.find((p: any) => p.countryCode === country);

  const TABS: [Tab, string][] = [
    ['destinations', 'Destinations'],
    ['company', 'Company documents'],
    ['reference', 'Reference'],
  ];

  return (
    <div>
      <PageHeader
        title="Country Compliance"
        subtitle="What each destination requires, and how far each requirement is confirmed"
      />

      <div className="mb-4 grid grid-cols-3 gap-3">
        <StatCard label="Requirements" value={verification?.requirements?.total ?? '—'} />
        <StatCard
          label="Confirmed"
          value={verification?.requirements?.byStatus?.VERIFIED ?? 0}
          trend={
            verification?.requirements?.total
              ? `${Math.round(((verification.requirements.byStatus?.VERIFIED ?? 0) / verification.requirements.total) * 100)}% checked against a source`
              : undefined
          }
          icon={<ShieldCheck size={18} />}
        />
        <StatCard label="Need checking" value={unconfirmed} icon={<FileWarning size={18} />} />
      </div>

      <div className="mb-4 flex gap-1 border-b border-slate-200">
        {TABS.map(([key, label]) => (
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

      {tab === 'destinations' && (
        <div className="space-y-4">
          <Card className="p-4">
            <div className="grid gap-3 sm:grid-cols-[1fr_1fr_auto]">
              <Field label="Destination">
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
                <div className="rounded-lg bg-slate-50 px-3 py-2">
                  <div className="text-[10px] uppercase tracking-wide text-slate-400">HS code</div>
                  <div className="font-mono text-sm font-semibold text-slate-800">{preview?.hsCode ?? '—'}</div>
                </div>
              </div>
            </div>

            {destProfile && (
              <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-slate-500">
                <MapPin size={13} className="text-slate-400" />
                <span className="font-medium text-slate-700">{destProfile.countryName}</span>
                <StatusPill status={destProfile.market} />
                {destProfile.lastVerifiedAt === null && <VerificationBadge status="UNVERIFIED" />}
                {destProfile.verificationSource && (
                  <a
                    href={destProfile.verificationSource}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 text-brand-700 hover:underline"
                  >
                    <ExternalLink size={11} /> source
                  </a>
                )}
                {destProfile.notes && <span className="text-slate-400">{destProfile.notes}</span>}
              </div>
            )}
          </Card>

          <Card>
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 px-4 py-3">
              <div>
                <h3 className="text-sm font-semibold text-slate-700">
                  Required for {destProfile?.countryName ?? 'this destination'}
                </h3>
                <p className="text-xs text-slate-400">
                  {preview?.requirements?.length ?? 0} documents · {preview?.verifiedCount ?? 0} confirmed
                  {preview?.unverifiedCount ? ` · ${preview.unverifiedCount} to confirm` : ''}
                </p>
              </div>
              <span className="text-[11px] text-slate-400">Ethiopian export side + destination side</span>
            </div>
            {preview?.requirements?.length ? (
              <RequirementGroups requirements={preview.requirements} />
            ) : (
              <EmptyState title="No requirements resolve for this destination" />
            )}
          </Card>

          {company?.gaps?.length > 0 && (
            <div className="flex flex-wrap items-center gap-2 rounded-lg bg-amber-50 px-3 py-2.5 text-xs text-amber-900 ring-1 ring-amber-600/15">
              <AlertTriangle size={14} className="shrink-0" />
              <span className="font-medium">
                {company.gaps.length} company document(s) not on file:
              </span>
              <span className="text-amber-800">{company.gaps.map((g: any) => g.documentType).join(', ')}</span>
              <button onClick={() => setTab('company')} className="ml-auto font-medium underline">
                Review
              </button>
            </div>
          )}
        </div>
      )}

      {tab === 'company' && (
        <div className="space-y-4">
          {company?.gaps?.length > 0 && (
            <div className="rounded-lg bg-rose-50 p-3 ring-1 ring-rose-600/15">
              <div className="flex items-center gap-2 text-sm font-semibold text-rose-900">
                <AlertTriangle size={15} />
                {company.gaps.length} mandatory document(s) not on file
              </div>
              <ul className="mt-1.5 space-y-1 text-xs text-rose-800">
                {company.gaps.map((g: any) => (
                  <li key={g.requirementId}>
                    <span className="font-medium">{g.documentType}</span> — {g.authority}
                    {g.legalBasis ? ` · ${g.legalBasis}` : ''}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {company?.expiring?.length > 0 && (
            <div className="rounded-lg bg-amber-50 px-3 py-2.5 text-xs text-amber-900 ring-1 ring-amber-600/15">
              <span className="font-semibold">
                {company.expiring.length} document(s) expire within 60 days:
              </span>{' '}
              {company.expiring
                .map((d: any) => `${d.title} (${new Date(d.expiresAt).toLocaleDateString()})`)
                .join(', ')}
            </div>
          )}

          <Card>
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 px-4 py-3">
              <div>
                <h3 className="text-sm font-semibold text-slate-700">Company documents</h3>
                <p className="text-xs text-slate-400">
                  Held once and referenced by every invoice that relies on them
                </p>
              </div>
              <Button onClick={() => setAddOpen(true)} className="h-8 text-xs">
                <Building2 size={13} className="mr-1.5" /> Record
              </Button>
            </div>

            {companyRows.map((r: any) => (
              <div key={r.id} className="flex items-center gap-2.5 border-b border-slate-100 px-4 py-2.5 last:border-0">
                <span
                  className={`h-2 w-2 shrink-0 rounded-full ${r.held ? 'bg-emerald-500' : 'bg-slate-300'}`}
                />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="truncate text-sm text-slate-700">{r.documentType}</span>
                    {r.verificationStatus && r.verificationStatus !== 'VERIFIED' && (
                      <VerificationBadge status={r.verificationStatus} />
                    )}
                    {!r.mandatory && <span className="text-[10px] text-slate-400">if applicable</span>}
                  </div>
                  <div className="truncate text-[11px] text-slate-400">
                    {r.authority}
                    {r.held ? ` · ${r.held.number}` : ''}
                  </div>
                </div>
                {r.held ? (
                  <span className="shrink-0 text-xs text-slate-500">
                    {r.held.expiresAt ? `expires ${new Date(r.held.expiresAt).toLocaleDateString()}` : 'no expiry'}
                  </span>
                ) : (
                  <span className="shrink-0 text-xs text-amber-700">not on file</span>
                )}
              </div>
            ))}
            {!companyRows.length && (
              <EmptyState title="No company-level requirements" hint="Check the Reference tab." />
            )}

            {unmatchedDocs.length > 0 && (
              <div className="border-t border-slate-100 px-4 py-3">
                <div className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                  Other documents on file
                </div>
                {unmatchedDocs.map((d: any) => (
                  <div key={d.id} className="flex items-center gap-2 py-1 text-xs text-slate-600">
                    <span>{d.title}</span>
                    <span className="font-mono text-slate-400">{d.number}</span>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>
      )}

      {tab === 'reference' && (
        <div className="space-y-4">
          {verification?.unsourced?.length > 0 && (
            <div className="flex items-start gap-2.5 rounded-lg bg-amber-50 p-3 text-xs text-amber-900 ring-1 ring-amber-600/15">
              <AlertTriangle size={15} className="mt-0.5 shrink-0 text-amber-700" />
              <div>
                <span className="font-semibold">
                  {verification.unsourced.length} requirement(s) have no official source recorded
                </span>
                <p className="mt-0.5 text-amber-800">
                  {verification.unsourced.map((u: any) => u.name).join(', ')}. These are assumptions, not
                  confirmed legal requirements.
                </p>
              </div>
            </div>
          )}

          <Card>
            <div className="flex flex-wrap items-center gap-2 border-b border-slate-200 p-3">
              <Input
                placeholder="Search name, document, authority, country…"
                value={reqFilter}
                onChange={(e) => setReqFilter(e.target.value)}
                className="max-w-xs"
              />
              <span className="text-xs text-slate-400">
                {filteredReqs.length} of {requirements?.length ?? 0}
              </span>
            </div>
            {filteredReqs.map((r: any) => (
              <RequirementRow key={r.id} r={{ ...r, matchScope: null, unmet: [] }} showScope />
            ))}
            {!filteredReqs.length && <EmptyState title="Nothing matches that search" />}
          </Card>

          <Card>
            <div className="border-b border-slate-200 px-4 py-3">
              <h3 className="text-sm font-semibold text-slate-700">Document templates</h3>
              <p className="text-xs text-slate-400">
                An official blank form, a document we generate, and a certificate an authority issues are three
                different things
              </p>
            </div>
            {(templates ?? []).map((t: any) => (
              <div
                key={t.id}
                className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-slate-100 px-4 py-2.5 text-xs last:border-0"
              >
                <span className="text-sm text-slate-700">{t.documentType}</span>
                <span
                  className={
                    t.templateKind === 'C_AUTHORITY_ISSUED'
                      ? 'rounded bg-violet-50 px-1.5 py-0.5 text-[10px] font-medium text-violet-700'
                      : t.templateKind === 'B_ERP_GENERATED'
                        ? 'rounded bg-brand-50 px-1.5 py-0.5 text-[10px] font-medium text-brand-700'
                        : 'rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium text-slate-600'
                  }
                >
                  {t.templateKind === 'C_AUTHORITY_ISSUED'
                    ? 'authority issues'
                    : t.templateKind === 'B_ERP_GENERATED'
                      ? 'we generate'
                      : 'official form'}
                </span>
                <span className="text-slate-400">{t.authority ?? '—'}</span>
                {t.officialSourceUrl && (
                  <a
                    href={t.officialSourceUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="ml-auto inline-flex items-center gap-1 text-brand-700 hover:underline"
                  >
                    <ExternalLink size={11} /> {t.format}
                  </a>
                )}
              </div>
            ))}
          </Card>

          <Card className="p-4">
            <h3 className="text-sm font-semibold text-slate-700">Verification</h3>
            <p className="mb-3 text-xs text-slate-500">
              Requirements change — ECTA amended its directive in 2025 and EUDR applies from December 2026. Each row
              records when it was last checked against an official source, so a stale entry is visible rather than
              looking authoritative.
            </p>
            <div className="grid gap-3 sm:grid-cols-2">
              {(['requirements', 'profiles'] as const).map((k) => (
                <div key={k} className="rounded-lg bg-slate-50 p-3">
                  <div className="text-xs capitalize text-slate-500">{k}</div>
                  <div className="mt-0.5 text-xl font-semibold text-slate-900">{verification?.[k]?.total ?? 0}</div>
                  <div className="mt-1.5 flex flex-wrap gap-2 text-xs">
                    {Object.entries(verification?.[k]?.byStatus ?? {}).map(([status, n]) => (
                      <span key={status} className="inline-flex items-center gap-1 text-slate-600">
                        <VerificationBadge status={status} /> {n as number}
                      </span>
                    ))}
                  </div>
                  {verification?.[k]?.stale > 0 && (
                    <div className="mt-1.5 text-xs text-amber-700">
                      {verification[k].stale} not re-checked in 180+ days
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
