import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Download, Users, BadgeCheck, FileText, Wallet, Pencil } from 'lucide-react';
import { PageHeader } from '@/components/PageHeader';
import { Card, StatCard, Button, Field, Input, Select, Modal, StatusPill, EmptyState } from '@/components/ui';
import { DataTable } from '@/components/DataTable';
import { api } from '@/lib/api';
import { exportRows } from '@/lib/export';
import { formatMoney } from '@madda/shared';

/**
 * Employees.
 *
 * Separate from Users: most staff on the payroll never sign in, and requiring an
 * account to pay someone would be the tail wagging the dog.
 */
export function EmployeesPage() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [typeFilter, setTypeFilter] = useState('');

  const { data: employees, isLoading } = useQuery({
    queryKey: ['employees', typeFilter],
    queryFn: async () => (await api.get(`/employees${typeFilter ? `?type=${typeFilter}` : ''}`)).data,
  });

  const { data: summary } = useQuery({
    queryKey: ['employees', 'summary'],
    queryFn: async () => (await api.get('/employees/summary')).data,
  });

  const { data: stations } = useQuery({
    queryKey: ['stations', 'list'],
    queryFn: async () => (await api.get('/stations')).data,
  });

  const save = useMutation({
    mutationFn: async (body: any) =>
      editing ? (await api.patch(`/employees/${editing.id}`, body)).data : (await api.post('/employees', body)).data,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['employees'] });
      setOpen(false);
      setEditing(null);
    },
  });

  const money = (v: any) => (v == null ? '—' : formatMoney(Number(v), 'ETB'));

  const columns = [
    {
      key: 'name',
      header: 'Employee',
      primary: true,
      render: (r: any) => (
        <div>
          <div className="font-medium">{r.name}</div>
          <div className="text-xs text-slate-400">
            {r.code}
            {r.position ? ` · ${r.position}` : ''}
          </div>
        </div>
      ),
    },
    {
      key: 'employmentType',
      header: 'Type',
      render: (r: any) => (
        <span
          className={
            r.employmentType === 'PERMANENT'
              ? 'rounded bg-brand-50 px-1.5 py-0.5 text-[10px] font-medium text-brand-700'
              : 'rounded bg-copper-100 px-1.5 py-0.5 text-[10px] font-medium text-copper-700'
          }
        >
          {r.employmentType === 'PERMANENT' ? 'Permanent' : 'Contract'}
        </span>
      ),
    },
    { key: 'station', header: 'Station', render: (r: any) => r.station?.name ?? '—', hideOnMobile: true },
    { key: 'basicSalary', header: 'Basic', render: (r: any) => money(r.basicSalary) },
    {
      key: 'allowances',
      header: 'Allowances',
      hideOnMobile: true,
      render: (r: any) =>
        money(Number(r.transportAllowance) + Number(r.housingAllowance) + Number(r.otherAllowance)),
    },
    {
      key: 'pensionEligible',
      header: 'Pension',
      hideOnMobile: true,
      render: (r: any) =>
        r.pensionEligible ? (
          <span className="text-xs text-slate-600">7% / 11%</span>
        ) : (
          <span className="text-xs text-slate-400">not enrolled</span>
        ),
    },
    { key: 'status', header: t('common.status'), render: (r: any) => <StatusPill status={r.status} /> },
    {
      key: 'edit',
      header: '',
      render: (r: any) => (
        <button
          onClick={() => {
            setEditing(r);
            setOpen(true);
          }}
          className="rounded p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
        >
          <Pencil size={14} />
        </button>
      ),
    },
  ];

  const exportCsv = () =>
    exportRows(
      `madda-employees.csv`,
      (employees ?? []).map((r: any) => ({
        Code: r.code,
        Name: r.name,
        Type: r.employmentType,
        Position: r.position ?? '',
        Station: r.station?.name ?? '',
        'Hire date': new Date(r.hireDate).toISOString().slice(0, 10),
        'Basic salary ETB': Number(r.basicSalary).toFixed(2),
        'Transport ETB': Number(r.transportAllowance).toFixed(2),
        'Housing ETB': Number(r.housingAllowance).toFixed(2),
        'Other allowance ETB': Number(r.otherAllowance).toFixed(2),
        'Pension eligible': r.pensionEligible ? 'Yes' : 'No',
        Status: r.status,
      })),
    );

  return (
    <div>
      <PageHeader
        title="Employees"
        subtitle="Permanent and contract staff on the payroll"
        action={
          <div className="flex gap-2">
            <button onClick={exportCsv} className="btn-ghost h-9 px-3 text-xs">
              <Download size={14} /> CSV
            </button>
            <Button
              onClick={() => {
                setEditing(null);
                setOpen(true);
              }}
              className="h-9 text-xs"
            >
              <Plus size={14} /> New employee
            </Button>
          </div>
        }
      />

      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="On the payroll" value={summary?.total ?? '—'} icon={<Users size={18} />} />
        <StatCard
          label="Permanent"
          value={summary?.permanent ?? '—'}
          trend={summary ? `${summary.contract} contract` : undefined}
          icon={<BadgeCheck size={18} />}
        />
        <StatCard label="Monthly basic" value={summary ? formatMoney(summary.monthlyBasic, 'ETB') : '—'} icon={<Wallet size={18} />} />
        <StatCard
          label="Employer pension / month"
          value={summary ? formatMoney(summary.monthlyEmployerPension, 'ETB') : '—'}
          trend={summary ? `on ${summary.pensionable} pensionable` : undefined}
          icon={<FileText size={18} />}
        />
      </div>

      <Card>
        <div className="flex flex-wrap items-center gap-2 border-b border-slate-100 px-4 py-3">
          <div className="flex gap-0.5 rounded-lg bg-slate-100 p-0.5">
            {[
              ['', 'All'],
              ['PERMANENT', 'Permanent'],
              ['CONTRACT', 'Contract'],
            ].map(([val, label]) => (
              <button
                key={label}
                onClick={() => setTypeFilter(val)}
                className={`rounded-md px-2.5 py-1 text-xs font-medium transition ${
                  typeFilter === val ? 'bg-white text-brand-800 shadow-sm' : 'text-slate-500 hover:text-slate-800'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
          <span className="text-xs text-slate-400">{employees?.length ?? 0} shown</span>
        </div>
        {employees?.length ? (
          <DataTable columns={columns as any} rows={employees} loading={isLoading} />
        ) : (
          <EmptyState
            title="No employees yet"
            hint="Add permanent and contract staff here, then run payroll for the month."
          />
        )}
      </Card>

      <Modal
        open={open}
        onClose={() => {
          setOpen(false);
          setEditing(null);
        }}
        title={editing ? `Edit ${editing.name}` : 'New employee'}
      >
        <form
          onSubmit={(e: React.FormEvent<HTMLFormElement>) => {
            e.preventDefault();
            const f = new FormData(e.currentTarget);
            const num = (k: string) => Number(f.get(k) || 0);
            save.mutate({
              name: f.get('name'),
              employmentType: f.get('employmentType'),
              position: f.get('position') || null,
              stationId: f.get('stationId') || null,
              hireDate: new Date(String(f.get('hireDate'))).toISOString(),
              phone: f.get('phone') || null,
              basicSalary: num('basicSalary'),
              transportAllowance: num('transportAllowance'),
              housingAllowance: num('housingAllowance'),
              otherAllowance: num('otherAllowance'),
              // Left undefined when untouched so the server default follows the
              // employment type rather than forcing pension on everyone.
              pensionEligible: f.get('pensionEligible') === null ? undefined : f.get('pensionEligible') === 'yes',
            });
          }}
          className="space-y-3"
        >
          <div className="grid grid-cols-2 gap-3">
            <Field label="Full name">
              <Input name="name" required defaultValue={editing?.name} placeholder="Abebe Kebede" />
            </Field>
            <Field label="Position">
              <Input name="position" defaultValue={editing?.position ?? ''} placeholder="Station Manager" />
            </Field>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Employment type">
              <Select name="employmentType" defaultValue={editing?.employmentType ?? 'PERMANENT'}>
                <option value="PERMANENT">Permanent</option>
                <option value="CONTRACT">Contract</option>
              </Select>
            </Field>
            <Field label="Station" hint="Optional">
              <Select name="stationId" defaultValue={editing?.stationId ?? ''}>
                <option value="">—</option>
                {(stations ?? []).map((s: any) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </Select>
            </Field>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Hire date">
              <Input
                type="date"
                name="hireDate"
                required
                defaultValue={editing ? new Date(editing.hireDate).toISOString().slice(0, 10) : ''}
              />
            </Field>
            <Field label="Phone">
              <Input name="phone" defaultValue={editing?.phone ?? ''} placeholder="+251 …" />
            </Field>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Basic salary (ETB)">
              <Input type="number" step="0.01" name="basicSalary" required defaultValue={editing?.basicSalary ?? ''} />
            </Field>
            <Field label="Transport allowance">
              <Input type="number" step="0.01" name="transportAllowance" defaultValue={editing?.transportAllowance ?? 0} />
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Housing allowance">
              <Input type="number" step="0.01" name="housingAllowance" defaultValue={editing?.housingAllowance ?? 0} />
            </Field>
            <Field label="Other allowance">
              <Input type="number" step="0.01" name="otherAllowance" defaultValue={editing?.otherAllowance ?? 0} />
            </Field>
          </div>

          <Field
            label="Pension"
            hint="Permanent staff are enrolled in the private-sector pension scheme by default; contract staff are not."
          >
            <Select name="pensionEligible" defaultValue={editing ? (editing.pensionEligible ? 'yes' : 'no') : ''}>
              <option value="">Follow employment type</option>
              <option value="yes">Enrolled (7% employee / 11% employer)</option>
              <option value="no">Not enrolled</option>
            </Select>
          </Field>

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
