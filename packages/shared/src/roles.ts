// RBAC model (PLAN.md §6). Permissions are `resource:action`. Deny by default.

export const ROLES = [
  'super_admin',
  'ceo',
  'general_manager',
  'finance_manager',
  'accountant',
  'sales_manager',
  'sales_officer',
  'docs_officer',
  'procurement_manager',
  'station_manager',
  'cherry_receiver',
  'processing_supervisor',
  'qc_officer',
  'warehouse_officer',
  'logistics_officer',
  'hr_admin',
  'auditor',
] as const;

export type Role = (typeof ROLES)[number];

export const PERMISSIONS = [
  'users.manage',
  'roles.manage',
  'settings.manage',
  'dashboard.read',
  'station.read',
  'station.write',
  'supplier.read',
  'supplier.write',
  'purchase.read',
  'purchase.write',
  'purchase.approve',
  'processing.read',
  'processing.write',
  'quality.read',
  'quality.write',
  'traceability.read',
  'inventory.read',
  'inventory.write',
  'buyer.read',
  'buyer.write',
  'quotation.read',
  'quotation.write',
  'proforma.read',
  'proforma.write',
  'proforma.send',
  'contract.read',
  'contract.write',
  'commercial.read',
  'commercial.write',
  'shipment.read',
  'shipment.write',
  'documents.read',
  'documents.write',
  'payment.read',
  'payment.write',
  'payment.approve',
  'expense.read',
  'expense.write',
  'expense.approve',
  'finance.read',
  'finance.approve',
  'report.read',
  'audit.read',
  'compliance.read',
  'compliance.write',
  'traceability.read',
  'traceability.write',
  'market.read',
  'employee.read',
  'employee.write',
  'payroll.read',
  'payroll.write',
  'payroll.approve',
] as const;

export type Permission = (typeof PERMISSIONS)[number];

const ALL: Permission[] = [...PERMISSIONS];
const READ_ONLY: Permission[] = PERMISSIONS.filter((p) => p.endsWith('.read'));
const SALES: Permission[] = [
  'dashboard.read',
  'buyer.read', 'buyer.write',
  'quotation.read', 'quotation.write',
  'proforma.read', 'proforma.write', 'proforma.send',
  'contract.read', 'contract.write',
  'commercial.read', 'commercial.write',
  'shipment.read',
  'documents.read', 'documents.write',
  'inventory.read',
  'report.read',
  'compliance.read',
  'traceability.read',
  'market.read',
];
const PROCUREMENT: Permission[] = [
  'dashboard.read',
  'station.read',
  'supplier.read', 'supplier.write',
  'purchase.read', 'purchase.write', 'purchase.approve',
  'processing.read',
  'inventory.read',
  'expense.read', 'expense.write',
  'payment.read',
  'report.read',
];
const FINANCE: Permission[] = [
  'dashboard.read',
  'payment.read', 'payment.write', 'payment.approve',
  'expense.read', 'expense.write', 'expense.approve',
  'finance.read', 'finance.approve',
  'purchase.read', 'commercial.read', 'proforma.read', 'contract.read',
  'report.read', 'audit.read',
  'employee.read', 'payroll.read', 'payroll.approve',
];
const STATION: Permission[] = [
  'dashboard.read',
  'station.read',
  'supplier.read',
  'purchase.read', 'purchase.write',
  'processing.read', 'processing.write',
  'quality.read',
  'inventory.read', 'inventory.write',
  'expense.read', 'expense.write',
  'payment.read',
  'report.read',
];

export const ROLE_PERMISSIONS: Record<Role, Permission[]> = {
  super_admin: ALL,
  ceo: ALL,
  general_manager: ALL,
  finance_manager: FINANCE,
  accountant: ['dashboard.read', 'payment.read', 'payment.write', 'expense.read', 'expense.write', 'finance.read', 'report.read'],
  sales_manager: [...SALES],
  sales_officer: SALES.filter(
    (p) => p !== 'proforma.send' && p !== 'buyer.write' && p !== 'contract.write',
  ),
  docs_officer: [
    'dashboard.read',
    'documents.read', 'documents.write',
    'shipment.read',
    'commercial.read', 'proforma.read', 'contract.read',
    'quality.read',
    'compliance.read', 'traceability.read',
    'report.read',
  ],
  procurement_manager: PROCUREMENT,
  station_manager: STATION,
  cherry_receiver: ['dashboard.read', 'station.read', 'supplier.read', 'purchase.read', 'purchase.write'],
  processing_supervisor: ['dashboard.read', 'processing.read', 'processing.write', 'inventory.read', 'quality.read'],
  qc_officer: [
    'dashboard.read',
    'quality.read', 'quality.write',
    'processing.read', 'inventory.read',
    'traceability.read', 'traceability.write', 'compliance.read',
  ],
  warehouse_officer: ['dashboard.read', 'inventory.read', 'inventory.write', 'report.read'],
  logistics_officer: [
    'dashboard.read',
    'shipment.read', 'shipment.write',
    'documents.read', 'documents.write',
    'inventory.read',
    'compliance.read', 'traceability.read',
  ],
  hr_admin: [
    'dashboard.read',
    'users.manage', 'settings.manage',
    'employee.read', 'employee.write',
    'payroll.read', 'payroll.write', 'payroll.approve',
    'report.read',
  ],
  auditor: ALL.filter((p) => p === 'audit.read' || p.endsWith('.read')),
};

export function permissionsForRoles(roles: Role[]): Permission[] {
  const set = new Set<Permission>();
  for (const r of roles) for (const p of ROLE_PERMISSIONS[r] ?? []) set.add(p);
  return [...set];
}

export function hasPermission(perms: Permission[], required: Permission): boolean {
  return perms.includes(required);
}

// Human-friendly labels for role selectors
export const ROLE_LABELS: Record<Role, string> = {
  super_admin: 'Super Admin',
  ceo: 'CEO / Owner',
  general_manager: 'General Manager',
  finance_manager: 'Finance Manager',
  accountant: 'Accountant',
  sales_manager: 'Sales / Export Manager',
  sales_officer: 'Sales / Export Officer',
  docs_officer: 'Export Documentation Officer',
  procurement_manager: 'Procurement Manager',
  station_manager: 'Station Manager',
  cherry_receiver: 'Cherry Receiver / Field Officer',
  processing_supervisor: 'Processing Supervisor',
  qc_officer: 'Quality / Cupping Officer',
  warehouse_officer: 'Warehouse / Inventory Officer',
  logistics_officer: 'Logistics / Shipping Officer',
  hr_admin: 'HR / Admin',
  auditor: 'Auditor',
};
