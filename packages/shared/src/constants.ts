// Reference data seeded from the Excel "Lists" sheet (see PLAN.md §2).

export const STATION_STATUS = ['Active', 'Inactive'] as const;
export const PAYMENT_STATUS = ['Pending', 'Partial', 'Paid', 'Cancelled'] as const;
export const COFFEE_PROCESS = ['Natural', 'Washed', 'Honey', 'Anaerobic', 'Other'] as const;
export const GRADE = ['Grade 1', 'Grade 2', 'Grade 3', 'Grade 4', 'Grade 5'] as const;
export const EXPENSE_CATEGORY = [
  'Labor',
  'Fuel',
  'Electricity',
  'Water',
  'Transport',
  'Packaging',
  'Maintenance',
  'Security',
  'Food',
  'Other',
] as const;
export const PAYMENT_METHOD = ['Cash', 'Bank Transfer', 'CBE Birr', 'Other'] as const;
export const SUPPLIER_TYPE = ['Farmer', 'Cooperative', 'Collector', 'Other'] as const;
export const SUPPLIER_STATUS = ['Active', 'Inactive'] as const;
export const INVENTORY_STATUS = ['Available', 'Reserved', 'Sold', 'Damaged', 'Released'] as const;
export const SALE_PAYMENT_STATUS = ['Pending', 'Partial', 'Paid', 'Cancelled'] as const;
export const BATCH_STATUS = [
  'Planned',
  'Processing',
  'Completed',
  'QC Passed',
  'Rejected',
] as const;
export const INVENTORY_LOCATION_TYPE = ['Warehouse', 'Station', 'Port', 'In Transit'] as const;

export const CURRENCIES = [
  { code: 'ETB', symbol: 'Br', label: 'Ethiopian Birr', labelOm: 'Birrii Itoophiyaa' },
  { code: 'USD', symbol: '$', label: 'US Dollar', labelOm: 'Doolara Ameerikaa' },
  { code: 'EUR', symbol: '€', label: 'Euro', labelOm: 'Yuuroo' },
  { code: 'GBP', symbol: '£', label: 'British Pound', labelOm: 'Pound Briitish' },
] as const;

export const LANGUAGES = [
  { code: 'en', label: 'English' },
  { code: 'om', label: 'Afaan Oromoo' },
] as const;

// Expected yields (%) — sanity-check warnings only, never hard blocks (PLAN.md §3.4)
export const EXPECTED_YIELD = {
  Natural: { min: 18, max: 24, typical: 22 },
  Washed: { min: 16, max: 22, typical: 20 },
  Honey: { min: 17, max: 23, typical: 21 },
  Anaerobic: { min: 16, max: 22, typical: 20 },
  Other: { min: 10, max: 30, typical: 20 },
} as const;

// Sales / export pipeline
export const QUOTATION_STATUS = ['Draft', 'Sent', 'Accepted', 'Expired', 'Cancelled'] as const;
export const PROFORMA_STATUS = [
  'Draft',
  'Issued',
  'Sent',
  'Responded',
  'Accepted',
  'Converted',
  'Cancelled',
] as const;
export const CONTRACT_STATUS = ['Draft', 'Signed', 'Registered', 'Completed', 'Cancelled'] as const;
export const COMMERCIAL_STATUS = ['Draft', 'Issued', 'Sent', 'Paid', 'Cancelled'] as const;
export const SHIPMENT_STATUS = ['Preparing', 'Docs Ready', 'Cleared', 'Shipped', 'Delivered'] as const;
export const SHIPMENT_MODE = ['Sea', 'Air'] as const;
export const DOC_TYPES = [
  'CLU Quality Certificate',
  'Phytosanitary Certificate',
  'ICO Certificate of Origin',
  'Chamber Certificate of Origin',
  'Commercial Invoice',
  'Packing List',
  'Bill of Lading',
  'Bank Permit / NBE',
  'Insurance Certificate',
  'Weight Certificate',
  'Fumigation Certificate',
  'EUDR Due Diligence',
] as const;
export const DOC_STATUS = ['Pending', 'Ready', 'Submitted'] as const;

export const APPROVAL_ITEMS = ['purchase', 'expense', 'discount'] as const;

export type StationStatus = (typeof STATION_STATUS)[number];
export type PaymentStatus = (typeof PAYMENT_STATUS)[number];
export type CoffeeProcess = (typeof COFFEE_PROCESS)[number];
export type Grade = (typeof GRADE)[number];
export type ExpenseCategory = (typeof EXPENSE_CATEGORY)[number];
export type PaymentMethod = (typeof PAYMENT_METHOD)[number];
export type SupplierType = (typeof SUPPLIER_TYPE)[number];
export type InventoryStatus = (typeof INVENTORY_STATUS)[number];
export type BatchStatus = (typeof BATCH_STATUS)[number];
export type QuotationStatus = (typeof QUOTATION_STATUS)[number];
export type ProformaStatus = (typeof PROFORMA_STATUS)[number];
export type ContractStatus = (typeof CONTRACT_STATUS)[number];
export type CommercialStatus = (typeof COMMERCIAL_STATUS)[number];
export type ShipmentStatus = (typeof SHIPMENT_STATUS)[number];
