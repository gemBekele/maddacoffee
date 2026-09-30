import { useTranslation } from 'react-i18next';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, X } from 'lucide-react';
import { PageHeader } from '@/components/PageHeader';
import { Button, Card, EmptyState, StatusPill } from '@/components/ui';
import { api } from '@/lib/api';
import { formatMoney } from '@madda/shared';

export function ApprovalsPage() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const { data: rows, isLoading } = useQuery({
    queryKey: ['approvals', 'Pending'],
    queryFn: async () => (await api.get('/approvals?status=Pending')).data,
  });

  const decide = async (id: string, status: 'Approved' | 'Rejected') => {
    await api.post(`/approvals/${id}/decide`, { status });
    qc.invalidateQueries({ queryKey: ['approvals'] });
  };

  return (
    <div>
      <PageHeader title="Approvals" subtitle="Requests waiting for your decision." />
      <Card className="p-5">
        {isLoading ? (
          <EmptyState title={t('common.loading')} />
        ) : !rows?.length ? (
          <EmptyState title="Nothing waiting" hint="Approval requests will appear here when enabled in Settings." />
        ) : (
          <div className="space-y-3">
            {rows.map((a: any) => (
              <div key={a.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-100 p-4">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold text-slate-900">{a.code ?? a.entity}</span>
                    <StatusPill status={a.entity} />
                  </div>
                  <div className="text-xs text-slate-500">{a.summary}</div>
                  <div className="mt-1 text-sm font-medium text-slate-700">{formatMoney(a.amount, a.currency)}</div>
                </div>
                <div className="flex gap-2">
                  <Button variant="ghost" onClick={() => decide(a.id, 'Rejected')}><X size={15} /> Reject</Button>
                  <Button onClick={() => decide(a.id, 'Approved')}><Check size={15} /> Approve</Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
