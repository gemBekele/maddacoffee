import { z } from 'zod';
import {
  BATCH_STATUS,
  COFFEE_PROCESS,
  EXPENSE_CATEGORY,
  GRADE,
  INVENTORY_STATUS,
  PAYMENT_METHOD,
  PAYMENT_STATUS,
  STATION_STATUS,
  SUPPLIER_STATUS,
  SUPPLIER_TYPE,
} from './constants';
import { ROLES } from './roles';

export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
});
export type LoginInput = z.infer<typeof loginSchema>;

export const createUserSchema = z.object({
  name: z.string().min(2),
  email: z.string().email(),
  password: z.string().min(8),
  phone: z.string().optional().nullable(),
  roles: z.array(z.enum(ROLES)).min(1),
  stationIds: z.array(z.string()).default([]),
  language: z.enum(['en', 'om']).default('en'),
});
export type CreateUserInput = z.infer<typeof createUserSchema>;

export const stationSchema = z.object({
  code: z.string().min(2).optional(),
  name: z.string().min(2),
  region: z.string().optional().nullable(),
  zone: z.string().optional().nullable(),
  location: z.string().optional().nullable(),
  manager: z.string().optional().nullable(),
  capacityTons: z.coerce.number().nonnegative().optional().nullable(),
  startDate: z.coerce.date().optional().nullable(),
  status: z.enum(STATION_STATUS).default('Active'),
  notes: z.string().optional().nullable(),
});
export type StationInput = z.infer<typeof stationSchema>;

export const supplierSchema = z.object({
  name: z.string().min(2),
  type: z.enum(SUPPLIER_TYPE).default('Farmer'),
  phone: z.string().optional().nullable(),
  location: z.string().optional().nullable(),
  bankInfo: z.string().optional().nullable(),
  status: z.enum(SUPPLIER_STATUS).default('Active'),
  notes: z.string().optional().nullable(),
});
export type SupplierInput = z.infer<typeof supplierSchema>;

export const cherryPurchaseSchema = z.object({
  date: z.coerce.date(),
  stationId: z.string(),
  supplierId: z.string(),
  receiptNo: z.string().optional().nullable(),
  cherryKg: z.coerce.number().positive(),
  pricePerKg: z.coerce.number().nonnegative(),
  currency: z.string().default('ETB'),
  paymentStatus: z.enum(PAYMENT_STATUS).default('Pending'),
  harvestYear: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
});
export type CherryPurchaseInput = z.infer<typeof cherryPurchaseSchema>;

export const processingBatchSchema = z.object({
  date: z.coerce.date(),
  stationId: z.string(),
  lotId: z.string().optional().nullable(),
  process: z.enum(COFFEE_PROCESS),
  cherryInputKg: z.coerce.number().nonnegative(),
  parchmentOutputKg: z.coerce.number().nonnegative().optional().nullable(),
  dryParchmentKg: z.coerce.number().nonnegative().optional().nullable(),
  greenOutputKg: z.coerce.number().nonnegative().optional().nullable(),
  moisturePct: z.coerce.number().min(0).max(100).optional().nullable(),
  grade: z.enum(GRADE).optional().nullable(),
  screenSize: z.string().optional().nullable(),
  cuppingScore: z.coerce.number().min(0).max(100).optional().nullable(),
  status: z.enum(BATCH_STATUS).default('Planned'),
  notes: z.string().optional().nullable(),
});
export type ProcessingBatchInput = z.infer<typeof processingBatchSchema>;

export const inventoryMovementSchema = z.object({
  stationId: z.string(),
  lotId: z.string(),
  direction: z.enum(['IN', 'OUT', 'ADJUST']),
  quantityKg: z.coerce.number(),
  warehouse: z.string().optional().nullable(),
  unitCost: z.coerce.number().nonnegative().default(0),
  currency: z.string().default('ETB'),
  status: z.enum(INVENTORY_STATUS).default('Available'),
  notes: z.string().optional().nullable(),
});
export type InventoryMovementInput = z.infer<typeof inventoryMovementSchema>;

export const expenseSchema = z.object({
  date: z.coerce.date(),
  stationId: z.string(),
  category: z.enum(EXPENSE_CATEGORY),
  description: z.string().min(2),
  amount: z.coerce.number().nonnegative(),
  currency: z.string().default('ETB'),
  paymentStatus: z.enum(PAYMENT_STATUS).default('Pending'),
  notes: z.string().optional().nullable(),
});
export type ExpenseInput = z.infer<typeof expenseSchema>;

export const paymentSchema = z.object({
  date: z.coerce.date(),
  stationId: z.string().optional().nullable(),
  payee: z.string().min(2),
  type: z.enum(['Supplier', 'Expense', 'Salary', 'Refund', 'Other']),
  referenceId: z.string().optional().nullable(),
  amount: z.coerce.number().positive(),
  currency: z.string().default('ETB'),
  method: z.enum(PAYMENT_METHOD).default('Cash'),
  status: z.enum(PAYMENT_STATUS).default('Pending'),
  notes: z.string().optional().nullable(),
});
export type PaymentInput = z.infer<typeof paymentSchema>;

const lineSchema = z.object({
  lotId: z.string().optional().nullable(),
  description: z.string().min(1),
  quantityKg: z.coerce.number().positive(),
  pricePerKg: z.coerce.number().nonnegative(),
});

export const quotationSchema = z.object({
  date: z.coerce.date(),
  buyerId: z.string(),
  currency: z.string().default('USD'),
  incoterm: z.string().default('FOB'),
  validUntil: z.coerce.date().optional().nullable(),
  notes: z.string().optional().nullable(),
  lines: z.array(lineSchema).min(1),
});
export type QuotationInput = z.infer<typeof quotationSchema>;

export const proformaSchema = z.object({
  date: z.coerce.date(),
  buyerId: z.string(),
  quotationId: z.string().optional().nullable(),
  currency: z.string().default('USD'),
  incoterm: z.string().default('FOB'),
  portLoading: z.string().optional().nullable(),
  portDischarge: z.string().optional().nullable(),
  validity: z.coerce.date().optional().nullable(),
  paymentTerms: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
  lines: z.array(lineSchema).min(1),
});
export type ProformaInput = z.infer<typeof proformaSchema>;

export const contractSchema = z.object({
  date: z.coerce.date(),
  buyerId: z.string(),
  proformaId: z.string().optional().nullable(),
  currency: z.string().default('USD'),
  incoterm: z.string().default('FOB'),
  amount: z.coerce.number().nonnegative(),
  eptaRef: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
});
export type ContractInput = z.infer<typeof contractSchema>;

export const shipmentSchema = z.object({
  contractId: z.string().optional().nullable(),
  date: z.coerce.date().optional().nullable(),
  mode: z.enum(['Sea', 'Air']).default('Sea'),
  // Destination is a commercial term of the invoice, not the shipment. It is
  // set on the commercial invoice, which owns the document pack.
  port: z.string().optional().nullable(),
  billOfLading: z.string().optional().nullable(),
  containerNo: z.string().optional().nullable(),
  receiver: z.string().optional().nullable(),
  address: z.string().optional().nullable(),
  contact: z.string().optional().nullable(),
  itemDescription: z.string().optional().nullable(),
  note: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
});
export type ShipmentInput = z.infer<typeof shipmentSchema>;

export const sendEmailSchema = z.object({
  to: z.string().email(),
  subject: z.string().min(1),
  message: z.string().optional().nullable(),
});
export type SendEmailInput = z.infer<typeof sendEmailSchema>;

export const approvalDecisionSchema = z.object({
  status: z.enum(['Approved', 'Rejected']),
  note: z.string().optional().nullable(),
});

export const buyerSchema = z.object({
  name: z.string().min(2),
  country: z.string().optional().nullable(),
  contactName: z.string().optional().nullable(),
  email: z.string().email().optional().nullable().or(z.literal('')),
  phone: z.string().optional().nullable(),
  incoterm: z.string().default('FOB'),
  currency: z.string().default('USD'),
  notes: z.string().optional().nullable(),
});
export type BuyerInput = z.infer<typeof buyerSchema>;

// ───────────────────────────── Compliance ─────────────────────────────

export const companyDocumentSchema = z.object({
  docType: z.string().min(2),
  title: z.string().min(2),
  issuer: z.string().min(2),
  number: z.string().min(1),
  issuedAt: z.coerce.date(),
  expiresAt: z.coerce.date().optional().nullable(),
  countryCode: z
    .string()
    .length(2)
    .toUpperCase()
    .regex(/^[A-Z]{2}$/)
    .optional()
    .nullable(),
  status: z.enum(['Valid', 'Expiring', 'Expired', 'Revoked']).optional(),
  notes: z.string().optional().nullable(),
});
export type CompanyDocumentInput = z.infer<typeof companyDocumentSchema>;

export const producerSchema = z.object({
  code: z.string().min(1),
  name: z.string().min(2),
  kind: z.enum(['FARMER', 'WASHING_STATION', 'COOPERATIVE']).default('FARMER'),
  phone: z.string().optional().nullable(),
  region: z.string().optional().nullable(),
  zone: z.string().optional().nullable(),
  woreda: z.string().optional().nullable(),
  kebele: z.string().optional().nullable(),
  latitude: z.coerce.number().optional().nullable(),
  longitude: z.coerce.number().optional().nullable(),
  notes: z.string().optional().nullable(),
});
export type ProducerInput = z.infer<typeof producerSchema>;

export const plotSchema = z.object({
  producerId: z.string().min(1),
  name: z.string().optional().nullable(),
  region: z.string().optional().nullable(),
  zone: z.string().optional().nullable(),
  woreda: z.string().optional().nullable(),
  kebele: z.string().optional().nullable(),
  polygon: z.any().optional().nullable(),
  geolocationMethod: z.enum(['GPS', 'GIS', 'MAPPED']).optional().nullable(),
  areaHa: z.coerce.number().optional().nullable(),
  landTenure: z.enum(['FREEHOLD', 'LEASE', 'HGU', 'COOPERATIVE', 'OTHER']).optional().nullable(),
  legalityDocRef: z.string().optional().nullable(),
  harvestedFrom: z.coerce.date().optional().nullable(),
  harvestedTo: z.coerce.date().optional().nullable(),
});
export type PlotInput = z.infer<typeof plotSchema>;

export const eudrStatementSchema = z.object({
  ddsReference: z.string().optional().nullable(),
  verificationNumber: z.string().optional().nullable(),
  submittedAt: z.coerce.date().optional().nullable(),
  submittedByName: z.string().optional().nullable(),
  status: z
    .enum(['NotStarted', 'GeodataPending', 'GeodataReady', 'Submitted', 'Accepted', 'Rejected'])
    .optional(),
  commodity: z.string().optional(),
  hsCode: z.string().optional().nullable(),
  quantityKg: z.coerce.number().optional().nullable(),
  countryOfProduction: z.string().optional(),
  notes: z.string().optional().nullable(),
});
export type EudrStatementInput = z.infer<typeof eudrStatementSchema>;

// ───────────────────────────── Payroll ─────────────────────────────

export const employeeSchema = z.object({
  code: z.string().optional(),
  name: z.string().min(2),
  employmentType: z.enum(['PERMANENT', 'CONTRACT']).default('PERMANENT'),
  position: z.string().optional().nullable(),
  department: z.string().optional().nullable(),
  stationId: z.string().optional().nullable(),
  hireDate: z.coerce.date(),
  endDate: z.coerce.date().optional().nullable(),
  phone: z.string().optional().nullable(),
  email: z.string().email().optional().nullable().or(z.literal('')),
  tin: z.string().optional().nullable(),
  bankName: z.string().optional().nullable(),
  bankAccount: z.string().optional().nullable(),
  basicSalary: z.coerce.number().nonnegative(),
  transportAllowance: z.coerce.number().nonnegative().default(0),
  housingAllowance: z.coerce.number().nonnegative().default(0),
  otherAllowance: z.coerce.number().nonnegative().default(0),
  currency: z.string().default('ETB'),
  pensionEligible: z.boolean().optional(),
  status: z.enum(['Active', 'OnLeave', 'Terminated']).default('Active'),
  notes: z.string().optional().nullable(),
});
export type EmployeeInput = z.infer<typeof employeeSchema>;

export const payrollRunSchema = z.object({
  periodYear: z.coerce.number().int().min(2000).max(2100),
  periodMonth: z.coerce.number().int().min(1).max(12),
  date: z.coerce.date().optional(),
  notes: z.string().optional().nullable(),
});
export type PayrollRunInput = z.infer<typeof payrollRunSchema>;
