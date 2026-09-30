import type { ReactNode } from 'react';
import { EmptyState } from './ui';
import { useTranslation } from 'react-i18next';

export interface Column<T> {
  key: string;
  header: string;
  render?: (row: T) => ReactNode;
  className?: string;
  primary?: boolean; // used as the card title on phones
  hideOnMobile?: boolean;
}

export function DataTable<T extends Record<string, any>>({
  columns,
  rows,
  loading,
}: {
  columns: Column<T>[];
  rows: T[];
  loading?: boolean;
}) {
  const { t } = useTranslation();

  if (loading) {
    return <EmptyState title={t('common.loading')} />;
  }
  if (!rows?.length) {
    return <EmptyState title={t('common.noData')} hint="Records will appear here." />;
  }

  const primary = columns.find((c) => c.primary) ?? columns[0];
  const mobileCols = columns.filter((c) => c !== primary && !c.hideOnMobile).slice(0, 3);

  return (
    <>
      {/* Desktop table */}
      <div className="hidden overflow-x-auto md:block">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-400">
            <tr>
              {columns.map((c) => (
                <th key={c.key} className={`px-4 py-3 font-medium ${c.className ?? ''}`}>
                  {c.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.map((row, i) => (
              <tr key={row.id ?? i} className="hover:bg-slate-50/70">
                {columns.map((c) => (
                  <td key={c.key} className={`px-4 py-3 align-middle ${c.className ?? ''}`}>
                    {c.render ? c.render(row) : (row[c.key] ?? '—')}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Mobile cards */}
      <div className="space-y-3 md:hidden">
        {rows.map((row, i) => (
          <div key={row.id ?? i} className="card p-4">
            <div className="mb-2 text-sm font-semibold text-slate-900">
              {primary.render ? primary.render(row) : row[primary.key]}
            </div>
            <dl className="grid grid-cols-2 gap-x-3 gap-y-2">
              {mobileCols.map((c) => (
                <div key={c.key}>
                  <dt className="text-[11px] uppercase tracking-wide text-slate-400">{c.header}</dt>
                  <dd className="text-sm text-slate-700">
                    {c.render ? c.render(row) : (row[c.key] ?? '—')}
                  </dd>
                </div>
              ))}
            </dl>
          </div>
        ))}
      </div>
    </>
  );
}
