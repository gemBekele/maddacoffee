import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Plus } from 'lucide-react';
import { PageHeader } from '@/components/PageHeader';
import { Button, Card, Field, Input, Modal, Select, StatusPill } from '@/components/ui';
import { DataTable } from '@/components/DataTable';
import { useList, useOfflineSave } from '@/lib/queries';
import { ROLES, ROLE_LABELS, type Role } from '@madda/shared';

export function UsersPage() {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const { data: rows, isLoading } = useList<any[]>(['users'], '/users');
  const { data: stations } = useList<any[]>(['stations'], '/stations');
  const save = useOfflineSave([['users']], { url: '/users' });
  const [form, setForm] = useState<any>({ name: '', email: '', password: '', roles: ['station_manager'], stationIds: [], language: 'en' });

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    await save.mutateAsync(form);
    setOpen(false);
  };

  const columns = [
    {
      key: 'name',
      header: 'Name',
      primary: true,
      render: (r: any) => (
        <div>
          <div className="font-medium text-slate-900">{r.name}</div>
          <div className="text-xs text-slate-400">{r.email}</div>
        </div>
      ),
    },
    {
      key: 'roles',
      header: 'Roles',
      render: (r: any) => (
        <div className="flex flex-wrap gap-1">
          {r.roles?.map((role: string) => (
            <StatusPill key={role} status={ROLE_LABELS[role as Role] ?? role} />
          ))}
        </div>
      ),
    },
    {
      key: 'stations',
      header: t('common.station'),
      render: (r: any) => r.stations?.map((s: any) => s.name).join(', ') || '—',
      hideOnMobile: true,
    },
    { key: 'isActive', header: t('common.status'), render: (r: any) => <StatusPill status={r.isActive ? 'Active' : 'Inactive'} /> },
  ];

  return (
    <div>
      <PageHeader
        title={t('nav.users')}
        action={
          <Button onClick={() => setOpen(true)}>
            <Plus size={16} /> {t('common.add')}
          </Button>
        }
      />
      <Card>
        <DataTable columns={columns} rows={rows ?? []} loading={isLoading} />
      </Card>

      <Modal open={open} onClose={() => setOpen(false)} title={t('common.add')}>
        <form onSubmit={submit} className="space-y-4">
          <Field label="Name">
            <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
          </Field>
          <Field label={t('auth.email')}>
            <Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} required />
          </Field>
          <Field label={t('auth.password')}>
            <Input type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} required minLength={8} />
          </Field>
          <Field label="Primary role">
            <Select value={form.roles[0]} onChange={(e) => setForm({ ...form, roles: [e.target.value] })}>
              {ROLES.map((r) => (
                <option key={r} value={r}>{ROLE_LABELS[r]}</option>
              ))}
            </Select>
          </Field>
          <Field label={t('common.station')}>
            <Select
              value={form.stationIds[0] ?? ''}
              onChange={(e) => setForm({ ...form, stationIds: e.target.value ? [e.target.value] : [] })}
            >
              <option value="">—</option>
              {stations?.map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
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
