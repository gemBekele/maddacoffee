import { useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Plus,
  Download,
  Printer,
  ArrowLeft,
  CheckCircle2,
  Banknote,
  Users,
  Wallet,
  Building2,
} from 'lucide-react';
import { PageHeader } from '@/components/PageHeader';
import { Card, StatCard, Button, Field, Input, Select, Modal, StatusPill, EmptyState } from '@/components/ui';
import { DataTable } from '@/components/DataTable';
import { api } from '@/lib/api';
import { downloadPdf, openPdf } from '@/lib/download';
import { exportRows } from '@/lib/export';
import { formatMoney } from '@madda/shared';

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

const money = (v: any) => (v == null ? '—' : formatMoney(Number(v), 'ETB'));

/** Payroll runs for the year. */
export function PayrollPage() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const now = new Date();

  const { data: runs, isLoading } = useQuery({
    queryKey: ['payroll', 'runs'],
    queryFn: async () => (await api.get('/payroll/runs')).data,
  });

  const { data: bands } = useQuery({
    queryKey: ['payroll', 'bands'],
    queryFn: async () => (await api.get('/payroll/tax-bands')).data,
  });

  const build = useMutation({
    mutationFn: async (body: any) => (await api.post('/payroll/runs', body)).data,
    onSuccess: (d: any) => {
      qc.invalidateQueries({ queryKey: ['payroll'] });
      if (!d?.error) setOpen(false);
    },
  });

  const columns = [
    {
      key: 'period',
      header: 'Period',
      primary: true,
      render: (r: any) => (
        <Link to={`/payroll/${r.id}`} className="font-medium text-brand-700 hover:underline">
          {MONTHS[r.periodMonth - 1]} {r.periodYear}
        </Link>
      ),
    },
    { key: 'code', header: 'Run', render: (r: any) => <span className="font-mono text-xs">{r.code}</span> },
    { key: 'employeeCount', header: 'Staff', render: (r: any) => String(r.employeeCount) },
    { key: 'totalGross', header: 'Gross', render: (r: any) => money(r.totalGross) },
    { key: 'totalIncomeTax', header: 'Tax', render: (r: any) => money(r.totalIncomeTax), hideOnMobile: true },
    { key: 'totalEmployeePension', header: 'Pension', render: (r: any) => money(r.totalEmployeePension), hideOnMobile: true },
    { key: 'totalNet', header: 'Net pay', render: (r: any) => money(r.totalNet) },
    { key: 'status', header: t('common.status'), render: (r: any) => <StatusPill status={r.status} /> },
  ];

  const exportCsv = () =>
    exportRows(
      'madda-payroll-runs.csv',
      (runs ?? []).map((r: any) => ({
        Run: r.code,
        Period: `${MONTHS[r.periodMonth - 1]} ${r.periodYear}`,
        Status: r.status,
        Employees: r.employeeCount,
        'Gross ETB': Number(r.totalGross).toFixed(2),
        'Income tax ETB': Number(r.totalIncomeTax).toFixed(2),
        'Employee pension ETB': Number(r.totalEmployeePension).toFixed(2),
        'Net pay ETB': Number(r.totalNet).toFixed(2),
        'Employer pension ETB': Number(r.totalEmployerPension).toFixed(2),
        'Employer cost ETB': Number(r.totalEmployerCost).toFixed(2),
      })),
    );

  return (
    <div>
      <PageHeader
        title="Payroll"
        subtitle="Monthly payroll for permanent and contract staff"
        action={
          <div className="flex gap-2">
            <button onClick={exportCsv} className="btn-ghost h-9 px-3 text-xs">
              <Download size={14} /> CSV
            </button>
            <Button onClick={() => setOpen(true)} className="h-9 text-xs">
              <Plus size={14} /> Run payroll
            </Button>
          </div>
        }
      />

      <Card>
        {runs?.length ? (
          <DataTable columns={columns as any} rows={runs} loading={isLoading} />
        ) : (
          <EmptyState
            title="No payroll runs yet"
            hint="Build a run for a month; it picks up every employee active in that period."
          />
        )}
      </Card>

      {bands && (
        <Card className="mt-4 p-5">
          <h3 className="text-sm font-semibold text-slate-700">How the deductions are worked out</h3>
          <p className="mt-0.5 text-xs text-slate-400">{bands.legalBasis}</p>

          <div className="mt-3 overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-slate-200 text-[10px] uppercase tracking-wide text-slate-400">
                  <th className="py-1.5 text-left font-semibold">Monthly taxable income (ETB)</th>
                  <th className="py-1.5 text-right font-semibold">Rate</th>
                  <th className="py-1.5 text-right font-semibold">Deduction (ETB)</th>
                </tr>
              </thead>
              <tbody>
                {bands.bands.map((b: any) => (
                  <tr key={b.label} className="border-b border-slate-100 last:border-0">
                    <td className="py-1.5 text-slate-600">{b.label}</td>
                    <td className="py-1.5 text-right font-medium text-slate-800">{(b.rate * 100).toFixed(0)}%</td>
                    <td className="py-1.5 text-right text-slate-600">{b.deduction.toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <p className="mt-3 text-[11px] leading-relaxed text-slate-400">
            Tax = (taxable income × rate) − deduction. Pension is {(bands.pension.employee * 100).toFixed(0)}% employee
            and {(bands.pension.employer * 100).toFixed(0)}% employer. {bands.note}
          </p>
        </Card>
      )}

      <Modal open={open} onClose={() => setOpen(false)} title="Run payroll">
        <form
          onSubmit={(e: React.FormEvent<HTMLFormElement>) => {
            e.preventDefault();
            const f = new FormData(e.currentTarget);
            build.mutate({
              periodYear: Number(f.get('periodYear')),
              periodMonth: Number(f.get('periodMonth')),
            });
          }}
          className="space-y-3"
        >
          <div className="grid grid-cols-2 gap-3">
            <Field label="Year">
              <Input type="number" name="periodYear" required defaultValue={now.getFullYear()} />
            </Field>
            <Field label="Month">
              <Select name="periodMonth" defaultValue={now.getMonth() + 1}>
                {MONTHS.map((m, i) => (
                  <option key={m} value={i + 1}>
                    {m}
                  </option>
                ))}
              </Select>
            </Field>
          </div>

          <div className="rounded-lg bg-slate-50 p-3 text-xs text-slate-500">
            Every employee active in that month is included, with pension applied according to their employment type.
            A Draft run can be rebuilt; once approved it is frozen.
          </div>

          {(build.data as any)?.error && (
            <div className="rounded-lg bg-rose-50 p-3 text-xs text-rose-800">{(build.data as any).error}</div>
          )}

          <div className="flex justify-end gap-2 pt-1">
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
              {t('common.cancel')}
            </Button>
            <Button type="submit" disabled={build.isPending}>
              {build.isPending ? 'Building…' : 'Build run'}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}

/** One payroll run: the register, the lines, and the approval step. */
export function PayrollDetailPage() {
  const { id } = useParams();
  const { t } = useTranslation();
  const qc = useQueryClient();

  const { data: run, isLoading } = useQuery({
    queryKey: ['payroll', 'run', id],
    queryFn: async () => (await api.get(`/payroll/runs/${id}`)).data,
  });

  const setStatus = useMutation({
    mutationFn: async (status: string) => (await api.patch(`/payroll/runs/${id}/status`, { status })).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['payroll'] }),
  });

  if (isLoading || !run) return <div className="p-6 text-sm text-slate-400">Loading…</div>;

  const period = `${MONTHS[run.periodMonth - 1]} ${run.periodYear}`;
  const isDraft = run.status === 'Draft';

  const columns = [
    { key: 'employeeName', header: 'Employee', primary: true, render: (r: any) => (
      <div>
        <div className="font-medium">{r.employeeName}</div>
        <div className="text-xs text-slate-400">
          {r.employeeCode}
          {r.employmentType === 'CONTRACT' ? ' · contract' : ''}
        </div>
      </div>
    ) },
    { key: 'basicSalary', header: 'Basic', render: (r: any) => money(r.basicSalary) },
    { key: 'allowances', header: 'Allow.', render: (r: any) => money(r.allowances), hideOnMobile: true },
    { key: 'grossPay', header: 'Gross', render: (r: any) => money(r.grossPay) },
    { key: 'incomeTax', header: 'Tax', render: (r: any) => money(r.incomeTax) },
    {
      key: 'employeePension',
      header: 'Pension',
      render: (r: any) => (r.pensionEligible ? money(r.employeePension) : <span className="text-xs text-slate-400">n/a</span>),
      hideOnMobile: true,
    },
    { key: 'netPay', header: 'Net pay', render: (r: any) => <span className="font-medium">{money(r.netPay)}</span> },
    {
      key: 'payslip',
      header: '',
      render: (r: any) => (
        <div className="flex gap-0.5">
          <button
            title="Payslip PDF"
            onClick={() => downloadPdf(`/documents/payroll/${run.id}/payslip/${r.id}`, `payslip-${r.employeeCode}.pdf`)}
            className="rounded p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
          >
            <Download size={14} />
          </button>
        </div>
      ),
    },
  ];

  return (
    <div>
      <Link to="/payroll" className="mb-3 inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-800">
        <ArrowLeft size={15} /> Payroll
      </Link>

      <PageHeader
        title={`Payroll ${period}`}
        subtitle={`${run.code} · ${run.employeeCount} employees`}
        action={<StatusPill status={run.status} />}
      />

      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Gross" value={money(run.totalGross)} icon={<Wallet size={18} />} />
        <StatCard label="Net pay" value={money(run.totalNet)} icon={<Banknote size={18} />} />
        <StatCard
          label="Income tax"
          value={money(run.totalIncomeTax)}
          trend="remittable to MoR"
          icon={<Building2 size={18} />}
        />
        <StatCard
          label="Employer cost"
          value={money(run.totalEmployerCost)}
          trend={`incl. ${money(run.totalEmployerPension)} pension`}
          icon={<Users size={18} />}
        />
      </div>

      <Card className="mb-4 p-4">
        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="ghost"
            onClick={() => openPdf(`/documents/payroll/${run.id}?inline=1`)}
            className="h-9 text-xs"
          >
            <Printer size={14} /> Print register
          </Button>
          <Button
            variant="ghost"
            onClick={() => downloadPdf(`/documents/payroll/${run.id}`, `${run.code}-payroll-register.pdf`)}
            className="h-9 text-xs"
          >
            <Download size={14} /> Register PDF
          </Button>

          <div className="ml-auto flex gap-2">
            {isDraft && (
              <Button onClick={() => setStatus.mutate('Approved')} className="h-9 text-xs" disabled={setStatus.isPending}>
                <CheckCircle2 size={14} /> Approve
              </Button>
            )}
            {run.status === 'Approved' && (
              <Button onClick={() => setStatus.mutate('Paid')} className="h-9 text-xs" disabled={setStatus.isPending}>
                <Banknote size={14} /> Mark paid
              </Button>
            )}
            {run.status === 'Paid' && <span className="text-xs text-slate-400">Paid {run.paidAt ? new Date(run.paidAt).toLocaleDateString() : ''}</span>}
          </div>
        </div>

        {(setStatus.data as any)?.error && (
          <div className="mt-3 rounded-lg bg-rose-50 p-3 text-xs text-rose-800">{(setStatus.data as any).error}</div>
        )}
      </Card>

      <Card>
        <div className="border-b border-slate-100 px-5 py-4">
          <h3 className="text-sm font-semibold text-slate-700">Register</h3>
          <p className="text-xs text-slate-400">
            Figures are fixed when the run is approved, so a later salary change cannot rewrite a paid month
          </p>
        </div>
        <DataTable columns={columns as any} rows={run.lines} />
      </Card>

      <Card className="mt-4 p-5">
        <h3 className="mb-3 text-sm font-semibold text-slate-700">Statutory summary</h3>
        <div className="grid gap-x-8 gap-y-2 text-sm sm:grid-cols-2">
          {[
            ['Gross salaries', run.totalGross],
            ['Employee pension (7%)', run.totalEmployeePension],
            ['Employer pension (11%)', run.totalEmployerPension],
            ['Income tax withheld', run.totalIncomeTax],
            ['Total remittable (tax + pension)', Number(run.totalIncomeTax) + Number(run.totalEmployeePension) + Number(run.totalEmployerPension)],
            ['Total employer cost', run.totalEmployerCost],
          ].map(([label, value]) => (
            <div key={label as string} className="flex items-baseline justify-between border-b border-slate-100 py-1.5">
              <span className="text-slate-500">{label}</span>
              <span className="font-medium text-slate-800">{money(value)}</span>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}
