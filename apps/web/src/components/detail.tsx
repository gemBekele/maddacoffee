import type { ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Mail,
  CheckCircle2,
  Clock,
  AlertCircle,
  Send,
  FileText,
  MessageSquare,
  Sparkles,
  Mailbox,
} from 'lucide-react';
import { api } from '@/lib/api';
import { cn, StatusPill } from './ui';
import { formatMoney } from '@madda/shared';

export function InfoRow({ label, value }: { label: string; value?: ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-3 border-b border-slate-50 py-2 last:border-0">
      <span className="text-xs text-slate-400">{label}</span>
      <span className="text-right text-sm font-medium text-slate-700">{value || '—'}</span>
    </div>
  );
}

export function CustomerCard({ buyer }: { buyer: any }) {
  if (!buyer) return null;
  return (
    <div>
      <div className="mb-3 flex items-center gap-3">
        <div className="grid h-11 w-11 place-items-center rounded-full bg-brand-100 text-sm font-semibold text-brand-700">
          {buyer.name?.charAt(0)?.toUpperCase()}
        </div>
        <div>
          <div className="text-sm font-semibold text-slate-900">{buyer.name}</div>
          <div className="text-xs text-slate-400">{buyer.code} · {buyer.country ?? '—'}</div>
        </div>
      </div>
      <InfoRow label="Contact" value={buyer.contactName} />
      <InfoRow label="Email" value={buyer.email} />
      <InfoRow label="Phone" value={buyer.phone} />
      <InfoRow label="Incoterm" value={buyer.incoterm} />
      <InfoRow label="Currency" value={buyer.currency} />
    </div>
  );
}

const EMAIL_TONE: Record<string, { icon: ReactNode; cls: string }> = {
  Sent: { icon: <CheckCircle2 size={14} />, cls: 'text-emerald-600' },
  Queued: { icon: <Clock size={14} />, cls: 'text-amber-600' },
  Failed: { icon: <AlertCircle size={14} />, cls: 'text-rose-600' },
};

export function SentEmails({ entity, entityId }: { entity: string; entityId?: string }) {
  const { data } = useQuery({
    queryKey: ['emails', entity, entityId],
    queryFn: async () => (await api.get(`/emails?entity=${entity}&entityId=${entityId}`)).data,
    enabled: !!entityId,
  });
  return (
    <div>
      <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-800">
        <Mailbox size={16} className="text-slate-400" /> Sent emails
      </div>
      {!data?.length ? (
        <p className="text-xs text-slate-400">No emails sent yet.</p>
      ) : (
        <div className="space-y-2">
          {data.map((e: any) => {
            const tone = EMAIL_TONE[e.status] ?? EMAIL_TONE.Queued;
            return (
              <div key={e.id} className="rounded-lg border border-slate-100 p-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate text-xs font-medium text-slate-700">{e.to}</span>
                  <span className={cn('inline-flex items-center gap-1 text-[11px] font-medium', tone.cls)}>
                    {tone.icon} {e.status}
                  </span>
                </div>
                <div className="mt-0.5 truncate text-xs text-slate-500">{e.subject}</div>
                <div className="mt-1 text-[11px] text-slate-400">
                  {new Date(e.createdAt).toLocaleString()}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

const ACT_ICON: Record<string, ReactNode> = {
  email: <Send size={13} />,
  status: <Sparkles size={13} />,
  created: <FileText size={13} />,
  note: <MessageSquare size={13} />,
};

export function ActivityFeed({ entity, entityId }: { entity: string; entityId?: string }) {
  const { data } = useQuery({
    queryKey: ['activity', entity, entityId],
    queryFn: async () => (await api.get(`/activity?entity=${entity}&entityId=${entityId}`)).data,
    enabled: !!entityId,
  });
  return (
    <div>
      <div className="mb-3 text-sm font-semibold text-slate-800">Latest activity</div>
      {!data?.length ? (
        <p className="text-xs text-slate-400">No activity yet.</p>
      ) : (
        <ol className="relative space-y-4 border-l border-slate-100 pl-5">
          {data.map((a: any) => (
            <li key={a.id} className="relative">
              <span className="absolute -left-[27px] grid h-6 w-6 place-items-center rounded-full bg-brand-50 text-brand-700">
                {ACT_ICON[a.type] ?? <Sparkles size={13} />}
              </span>
              <div className="text-sm text-slate-700">{a.message}</div>
              <div className="text-[11px] text-slate-400">{new Date(a.createdAt).toLocaleString()}</div>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

export function CustomerHistory({ buyerId }: { buyerId?: string }) {
  const { data } = useQuery({
    queryKey: ['buyer', buyerId],
    queryFn: async () => (await api.get(`/buyers/${buyerId}`)).data,
    enabled: !!buyerId,
  });
  if (!data) return null;
  const proformas = data.proformas ?? [];
  const invoices = data.commercialInvoices ?? [];
  const totalSold = invoices.reduce(
    (a: number, i: any) => a + (i.lines ?? []).reduce((x: number, l: any) => x + Number(l.amount), 0),
    0,
  );
  return (
    <div>
      <div className="mb-3 text-sm font-semibold text-slate-800">Customer history</div>
      <div className="grid grid-cols-3 gap-2 text-center">
        <Stat label="Proformas" value={proformas.length} />
        <Stat label="Invoices" value={invoices.length} />
        <Stat label="Sold" value={formatMoney(totalSold, data.currency).replace(/\.00$/, '')} small />
      </div>
      <div className="mt-3 space-y-1.5">
        {proformas.slice(0, 4).map((p: any) => (
          <div key={p.id} className="flex items-center justify-between text-xs">
            <span className="text-slate-500">{p.code}</span>
            <StatusPill status={p.status} />
          </div>
        ))}
        {invoices.slice(0, 4).map((i: any) => (
          <div key={i.id} className="flex items-center justify-between text-xs">
            <span className="text-slate-500">{i.code}</span>
            <StatusPill status={i.status} />
          </div>
        ))}
      </div>
    </div>
  );
}

function Stat({ label, value, small }: { label: string; value: ReactNode; small?: boolean }) {
  return (
    <div className="rounded-lg bg-slate-50 p-2">
      <div className={cn('font-semibold text-slate-900', small ? 'text-xs' : 'text-base')}>{value}</div>
      <div className="text-[10px] uppercase tracking-wide text-slate-400">{label}</div>
    </div>
  );
}
