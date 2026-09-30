import { CURRENCIES } from './constants';

export type CurrencyCode = (typeof CURRENCIES)[number]['code'];

export function currencySymbol(code: string): string {
  return CURRENCIES.find((c) => c.code === code)?.symbol ?? code;
}

export function formatMoney(
  amount: number | string | null | undefined,
  code = 'ETB',
  locale = 'en',
): string {
  const value = typeof amount === 'string' ? Number(amount) : amount ?? 0;
  if (Number.isNaN(value)) return `${currencySymbol(code)} 0`;
  const formatted = new Intl.NumberFormat(locale, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
  return `${currencySymbol(code)} ${formatted}`;
}

export function formatKg(amount: number | string | null | undefined, locale = 'en'): string {
  const value = typeof amount === 'string' ? Number(amount) : amount ?? 0;
  if (Number.isNaN(value)) return '0 kg';
  return `${new Intl.NumberFormat(locale, { maximumFractionDigits: 2 }).format(value)} kg`;
}

export function convert(
  amount: number,
  from: CurrencyCode,
  to: CurrencyCode,
  rates: Record<string, number>,
): number {
  if (from === to) return amount;
  const fromRate = rates[from] ?? 1;
  const toRate = rates[to] ?? 1;
  return (amount / fromRate) * toRate;
}
