import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';
import type { ReactNode, ButtonHTMLAttributes, InputHTMLAttributes, SelectHTMLAttributes } from 'react';
import { Cloud, CloudOff, RefreshCw, X } from 'lucide-react';
import { useSyncStatus } from '@/lib/offline/useSync';

export function cn(...args: any[]) {
  return twMerge(clsx(args));
}

export function Card({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn('card', className)}>{children}</div>;
}

export function StatCard({
  label,
  value,
  trend,
  icon,
}: {
  label: string;
  value: ReactNode;
  trend?: string;
  icon?: ReactNode;
}) {
  return (
    <Card className="p-4">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-slate-500">{label}</span>
        {icon && <span className="text-slate-400">{icon}</span>}
      </div>
      <div className="mt-2 text-2xl font-semibold tracking-tight text-slate-900">{value}</div>
      {trend && (
        <div className="mt-1 text-xs font-medium text-emerald-600">{trend}</div>
      )}
    </Card>
  );
}

const TONES: Record<string, string> = {
  green: 'bg-emerald-50 text-emerald-700 ring-emerald-600/20',
  amber: 'bg-amber-50 text-amber-700 ring-amber-600/20',
  red: 'bg-rose-50 text-rose-700 ring-rose-600/20',
  blue: 'bg-brand-50 text-brand-700 ring-brand-600/20',
  gray: 'bg-slate-100 text-slate-600 ring-slate-500/20',
};

export function statusTone(status?: string | null): keyof typeof TONES {
  const s = (status ?? '').toLowerCase();
  if (['paid', 'active', 'completed', 'available', 'synced', 'qc passed', 'delivered', 'converted'].includes(s)) return 'green';
  if (['pending', 'partial', 'processing', 'reserved', 'planned', 'restock', 'in transit', 'responded'].includes(s)) return 'amber';
  if (['cancelled', 'rejected', 'damaged', 'failed', 'out of stock'].includes(s)) return 'red';
  if (['draft', 'issued', 'sent', 'in stock', 'released', 'received', 'preparing', 'docs ready', 'cleared'].includes(s)) return 'blue';
  return 'gray';
}

export function StatusPill({ status, className }: { status?: string | null; className?: string }) {
  if (!status) return null;
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset',
        TONES[statusTone(status)],
        className,
      )}
    >
      {status}
    </span>
  );
}

type BtnProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'ghost';
};
export function Button({ variant = 'primary', className, ...rest }: BtnProps) {
  return (
    <button
      className={cn(variant === 'primary' ? 'btn-primary' : 'btn-ghost', className)}
      {...rest}
    />
  );
}

export function Field({
  label,
  children,
  hint,
}: {
  label: string;
  children: ReactNode;
  hint?: string;
}) {
  return (
    <label className="block">
      <span className="label">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-xs text-slate-400">{hint}</span>}
    </label>
  );
}

export function Input(props: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={cn('input', props.className)} {...props} />;
}

export function Select(props: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select className={cn('input', props.className)} {...props} />;
}

export function EmptyState({ title, hint }: { title: string; hint?: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-1 py-14 text-center">
      <p className="text-sm font-medium text-slate-600">{title}</p>
      {hint && <p className="text-xs text-slate-400">{hint}</p>}
    </div>
  );
}

export function Modal({
  open,
  onClose,
  title,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
}) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/40 sm:items-center">
      <div className="max-h-[92vh] w-full overflow-y-auto rounded-t-2xl bg-white p-5 shadow-xl sm:max-w-lg sm:rounded-2xl">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-base font-semibold text-slate-900">{title}</h2>
          <button onClick={onClose} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100">
            <X size={18} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

/**
 * Verification badge.
 *
 * The whole point of the compliance module is that an unverified requirement
 * never looks like a confirmed legal one, so this badge is rendered next to
 * every requirement rather than hidden in a detail pane.
 */
export function VerificationBadge({ status, className }: { status?: string | null; className?: string }) {
  const map: Record<string, { label: string; cls: string; title: string }> = {
    VERIFIED: {
      label: 'Verified',
      cls: 'bg-emerald-50 text-emerald-700 ring-emerald-600/20',
      title: 'Checked against an official authority source. Follow the link on the requirement for the citation.',
    },
    NEEDS_LOCAL_CHECK: {
      label: 'Check locally',
      cls: 'bg-amber-50 text-amber-700 ring-amber-600/20',
      title: 'Not yet confirmed against a primary source. Confirm with the authority before relying on it.',
    },
    UNVERIFIED: {
      label: 'Unverified',
      cls: 'bg-rose-50 text-rose-700 ring-rose-600/20',
      title: 'No authoritative source found. This is an assumption, not a confirmed legal requirement.',
    },
  };
  const key = status && map[status] ? status : 'UNVERIFIED';
  const m = map[key];
  return (
    <span
      title={m.title}
      className={cn(
        'inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ring-1 ring-inset',
        m.cls,
        className,
      )}
    >
      {m.label}
    </span>
  );
}

/** Who actually issues the document. Stops us implying we issue certificates. */
export function IssuerBadge({ type, className }: { type?: string | null; className?: string }) {
  const map: Record<string, { label: string; cls: string; title: string }> = {
    ERP_GENERATED: {
      label: 'ERP generated',
      cls: 'bg-brand-50 text-brand-700 ring-brand-600/20',
      title: 'Generated by this system from shipment data. Not a government-issued certificate.',
    },
    AUTHORITY_ISSUED: {
      label: 'Authority issues',
      cls: 'bg-violet-50 text-violet-700 ring-violet-600/20',
      title: 'We prepare the application data; the named authority issues the official certificate.',
    },
    PRIVATE_PARTY: {
      label: 'Third party',
      cls: 'bg-slate-100 text-slate-600 ring-slate-500/20',
      title: 'Issued by a private party such as a carrier, insurer, or the buyer\'s agent.',
    },
  };
  const key = type && map[type] ? type : null;
  if (!key) return null;
  const m = map[key];
  return (
    <span
      title={m.title}
      className={cn(
        'inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ring-1 ring-inset',
        m.cls,
        className,
      )}
    >
      {m.label}
    </span>
  );
}

/** How the requirement is satisfied: paper, PDF, online filing, API, etc. */
export function SubmissionBadge({ method, className }: { method?: string | null; className?: string }) {
  const labels: Record<string, string> = {
    PAPER: 'Paper',
    PDF: 'PDF',
    ONLINE: 'Online',
    ELECTRONIC_DECLARATION: 'E-declaration',
    API: 'API',
    CERTIFICATE: 'Certificate',
    ELECTRONIC: 'Electronic',
  };
  const label = method ? labels[method] ?? method : null;
  if (!label) return null;
  return (
    <span className={cn('inline-flex shrink-0 items-center rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium text-slate-600', className)}>
      {label}
    </span>
  );
}

export function SyncChip() {
  const { state, pending, failed, flush } = useSyncStatus();
  const map = {
    idle: { cls: 'text-emerald-600', icon: <Cloud size={14} />, label: 'Synced' },
    syncing: { cls: 'text-brand-600', icon: <RefreshCw size={14} className="animate-spin" />, label: 'Syncing…' },
    offline: { cls: 'text-amber-600', icon: <CloudOff size={14} />, label: `Offline${pending ? ` · ${pending}` : ''}` },
    error: { cls: 'text-rose-600', icon: <CloudOff size={14} />, label: `Sync failed${failed ? ` · ${failed}` : ''}` },
  }[state];
  return (
    <button
      onClick={flush}
      title="Sync now"
      className={cn('inline-flex items-center gap-1.5 rounded-full bg-white px-2.5 py-1 text-xs font-medium ring-1 ring-slate-200', map.cls)}
    >
      {map.icon}
      {map.label}
    </button>
  );
}
