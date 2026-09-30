// Default numbering rules (PLAN.md §8.1). All configurable in Admin Settings.

export const DOC_PREFIX = {
  station: 'ST',
  supplier: 'SUP',
  buyer: 'BUY',
  purchase: 'PUR',
  batch: 'BATCH',
  lot: 'LOT',
  inventory: 'INV',
  payment: 'PAY',
  expense: 'EXP',
  quotation: 'QTN',
  proforma: 'PRO',
  commercial: 'COM',
  contract: 'CON',
  shipment: 'SHP',
} as const;

export type DocPrefixKey = keyof typeof DOC_PREFIX;

export interface NumberFormat {
  prefix: string;
  includeYear: boolean;
  padding: number;
  reset: 'never' | 'yearly' | 'monthly';
}

export function defaultFormat(key: DocPrefixKey): NumberFormat {
  const yearly = !['station', 'lot'].includes(key);
  return {
    prefix: DOC_PREFIX[key],
    includeYear: yearly,
    padding: key === 'station' ? 3 : 4,
    reset: yearly ? 'yearly' : 'never',
  };
}

export function formatDocumentNumber(
  fmt: NumberFormat,
  sequence: number,
  date: Date = new Date(),
): string {
  const parts = [fmt.prefix];
  if (fmt.includeYear) parts.push(String(date.getFullYear()));
  parts.push(String(sequence).padStart(fmt.padding, '0'));
  return parts.join('-');
}

export function formatLotId(stationCode: string, process: string, sequence: number): string {
  const proc = (process || 'OTH').slice(0, 3).toUpperCase();
  return `LOT-${stationCode.toUpperCase()}-${proc}-${String(sequence).padStart(3, '0')}`;
}
