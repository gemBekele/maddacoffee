import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { PageHeader } from '@/components/PageHeader';
import { Button, Card, Field, Input, Select } from '@/components/ui';
import { api } from '@/lib/api';
import { useQuery, useQueryClient } from '@tanstack/react-query';

export function SettingsPage() {
  const { t, i18n } = useTranslation();
  const qc = useQueryClient();
  const { data } = useQuery({
    queryKey: ['settings'],
    queryFn: async () => (await api.get('/reference/settings')).data,
  });
  const [approvals, setApprovals] = useState<any>({
    purchase: false,
    expense: false,
    payment: false,
    discount: false,
    threshold: 0,
  });
  const [org, setOrg] = useState<any>({ name: 'Ancient Halo Coffee Export', defaultCurrency: 'ETB' });

  useEffect(() => {
    if (data?.approvals) setApprovals(data.approvals);
    if (data?.organization) setOrg(data.organization);
  }, [data]);

  const save = async () => {
    await api.put('/reference/settings', { approvals, organization: org });
    qc.invalidateQueries({ queryKey: ['settings'] });
  };

  const toggle = (key: string) => setApprovals({ ...approvals, [key]: !approvals[key] });

  return (
    <div>
      <PageHeader title={t('settings.title')} subtitle={t('settings.approvalsHint')} action={<Button onClick={save}>{t('common.save')}</Button>} />

      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="p-5">
          <h3 className="mb-4 text-sm font-semibold text-slate-700">{t('settings.approvals')}</h3>
          <div className="space-y-3">
            {[
              ['purchase', 'Cherry purchases'],
              ['expense', 'Expenses'],
              ['discount', 'Discounts / price changes'],
            ].map(([key, label]) => (
              <label key={key} className="flex items-center justify-between rounded-lg border border-slate-100 px-3 py-2.5">
                <span className="text-sm text-slate-700">{label}</span>
                <button
                  type="button"
                  onClick={() => toggle(key)}
                  className={`relative h-6 w-11 rounded-full transition ${approvals[key] ? 'bg-brand-600' : 'bg-slate-300'}`}
                >
                  <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white transition ${approvals[key] ? 'left-[22px]' : 'left-0.5'}`} />
                </button>
              </label>
            ))}
            <Field label="Approval threshold (ETB)" hint="0 = approve everything when enabled.">
              <Input type="number" value={approvals.threshold} onChange={(e) => setApprovals({ ...approvals, threshold: Number(e.target.value) })} />
            </Field>
          </div>
        </Card>

        <Card className="p-5">
          <h3 className="mb-4 text-sm font-semibold text-slate-700">{t('settings.organization')}</h3>
          <div className="space-y-4">
            <Field label="Company name">
              <Input value={org.name} onChange={(e) => setOrg({ ...org, name: e.target.value })} />
            </Field>
            <Field label={t('settings.currency')}>
              <Select value={org.defaultCurrency} onChange={(e) => setOrg({ ...org, defaultCurrency: e.target.value })}>
                <option value="ETB">ETB</option>
                <option value="USD">USD</option>
                <option value="EUR">EUR</option>
              </Select>
            </Field>
            <Field label={t('settings.language')}>
              <Select
                value={i18n.language}
                onChange={(e) => {
                  i18n.changeLanguage(e.target.value);
                  localStorage.setItem('madda.lang', e.target.value);
                }}
              >
                <option value="en">English</option>
                <option value="om">Afaan Oromoo</option>
              </Select>
            </Field>
          </div>
        </Card>
      </div>
    </div>
  );
}
