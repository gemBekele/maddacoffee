import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Plus } from 'lucide-react';
import { PageHeader } from '@/components/PageHeader';
import { Button, Card, Field, Input, Modal, Select, StatusPill } from '@/components/ui';
import { DataTable } from '@/components/DataTable';
import { useList, useOfflineSave } from '@/lib/queries';
import { useAuth } from '@/lib/auth';
import { formatKg, COFFEE_PROCESS, GRADE, BATCH_STATUS } from '@madda/shared';

export function ProcessingPage() {
  const { t } = useTranslation();
  const { can } = useAuth();
  const [open, setOpen] = useState(false);
  const { data: rows, isLoading } = useList<any[]>(['processing'], '/processing');
  const { data: stations } = useList<any[]>(['stations'], '/stations');
  const save = useOfflineSave([['processing'], ['inventory']], { url: '/processing' });

  const [form, setForm] = useState<any>({
    date: new Date().toISOString().slice(0, 10),
    stationId: '',
    process: 'Washed',
    cherryInputKg: '',
    parchmentOutputKg: '',
    dryParchmentKg: '',
    greenOutputKg: '',
    moisturePct: '',
    grade: 'Grade 1',
    screenSize: '',
    cuppingScore: '',
    status: 'Planned',
  });

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const num = (v: any) => (v === '' || v == null ? undefined : Number(v));
    await save.mutateAsync({
      ...form,
      cherryInputKg: Number(form.cherryInputKg),
      parchmentOutputKg: num(form.parchmentOutputKg),
      dryParchmentKg: num(form.dryParchmentKg),
      greenOutputKg: num(form.greenOutputKg),
      moisturePct: num(form.moisturePct),
      cuppingScore: num(form.cuppingScore),
    });
    setOpen(false);
  };

  const columns = [
    {
      key: 'code',
      header: 'Batch',
      primary: true,
      render: (r: any) => (
        <div>
          <div className="font-medium text-slate-900">{r.code}</div>
          <div className="text-xs text-slate-400">{r.lotId}</div>
        </div>
      ),
    },
    { key: 'date', header: t('common.date'), render: (r: any) => new Date(r.date).toLocaleDateString() },
    { key: 'process', header: t('processing.process') },
    { key: 'cherryInputKg', header: t('processing.cherryIn'), render: (r: any) => formatKg(r.cherryInputKg) },
    { key: 'greenOutputKg', header: t('processing.greenOut'), render: (r: any) => formatKg(r.greenOutputKg) },
    {
      key: 'yieldPct',
      header: t('processing.yield'),
      render: (r: any) => (r.yieldPct ? `${r.yieldPct}%` : '—'),
    },
    { key: 'status', header: t('common.status'), render: (r: any) => <StatusPill status={r.status} /> },
  ];

  return (
    <div>
      <PageHeader
        title={t('processing.title')}
        action={
          can('processing.write') && (
            <Button onClick={() => setOpen(true)}>
              <Plus size={16} /> {t('processing.new')}
            </Button>
          )
        }
      />
      <Card>
        <DataTable columns={columns} rows={rows ?? []} loading={isLoading} />
      </Card>

      <Modal open={open} onClose={() => setOpen(false)} title={t('processing.new')}>
        <form onSubmit={submit} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <Field label={t('common.date')}>
              <Input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} required />
            </Field>
            <Field label={t('common.station')}>
              <Select value={form.stationId} onChange={(e) => setForm({ ...form, stationId: e.target.value })} required>
                <option value="">—</option>
                {stations?.map((s) => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </Select>
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label={t('processing.process')}>
              <Select value={form.process} onChange={(e) => setForm({ ...form, process: e.target.value })}>
                {COFFEE_PROCESS.map((p) => (
                  <option key={p} value={p}>{p}</option>
                ))}
              </Select>
            </Field>
            <Field label={t('processing.grade')}>
              <Select value={form.grade} onChange={(e) => setForm({ ...form, grade: e.target.value })}>
                {GRADE.map((g) => (
                  <option key={g} value={g}>{g}</option>
                ))}
              </Select>
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label={t('processing.cherryIn')}>
              <Input type="number" step="0.01" value={form.cherryInputKg} onChange={(e) => setForm({ ...form, cherryInputKg: e.target.value })} required />
            </Field>
            <Field label={t('processing.greenOut')}>
              <Input type="number" step="0.01" value={form.greenOutputKg} onChange={(e) => setForm({ ...form, greenOutputKg: e.target.value })} />
            </Field>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <Field label="Parchment">
              <Input type="number" step="0.01" value={form.parchmentOutputKg} onChange={(e) => setForm({ ...form, parchmentOutputKg: e.target.value })} />
            </Field>
            <Field label="Moisture %">
              <Input type="number" step="0.1" value={form.moisturePct} onChange={(e) => setForm({ ...form, moisturePct: e.target.value })} />
            </Field>
            <Field label="Cupping">
              <Input type="number" step="0.1" value={form.cuppingScore} onChange={(e) => setForm({ ...form, cuppingScore: e.target.value })} />
            </Field>
          </div>
          <Field label={t('common.status')}>
            <Select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>
              {BATCH_STATUS.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </Select>
          </Field>
          <div className="flex justify-end gap-2 pt-1">
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>{t('common.cancel')}</Button>
            <Button type="submit" disabled={save.isPending}>{t('common.save')}</Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
