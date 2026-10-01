/**
 * Ethiopian payroll calculation.
 *
 * Sources:
 *  - Employment income tax (PAYE): Federal Income Tax Amendment Proclamation
 *    No. 1395/2025, effective 1 July 2025, which replaced the brackets in
 *    Proclamation 979/2016. Six bands, tax-free threshold raised to ETB 2,000.
 *  - Pension: Private Organization Employees Pension Proclamation No. 715/2011
 *    art. 10 — employer 11%, employee 7%, on the salary of the employee.
 *    Directive No. 1087/2025 art. 15 states the base is the gross monthly
 *    salary, which is what is used here.
 *
 * Two things this module is careful about:
 *
 *  1. PAYE is charged on the gross taxable salary. The employee's 7% pension is
 *     withheld *after* tax, not before it. Both the worked examples published by
 *     Ethiopian payroll references and the template in the 2025 guidance
 *     compute tax on the full gross and then subtract pension to reach net pay.
 *     Treating pension as pre-tax would understate the tax.
 *
 *  2. The brackets are expressed as (rate, deduction), which is how the
 *     proclamation states them. That formulation is continuous across the band
 *     boundaries; a plain progressive-band implementation gives a different
 *     (wrong) answer at each step.
 */

export const PENSION_RATES = {
  employee: 0.07,
  employer: 0.11,
} as const;

export interface TaxBand {
  /** Inclusive upper bound in ETB; null for the top band. */
  upTo: number | null;
  rate: number;
  /** Fixed deduction applied after multiplying by the rate. */
  deduction: number;
  label: string;
}

/**
 * Monthly employment income tax bands — Proclamation No. 1395/2025.
 * Tax = (income x rate) - deduction.
 */
export const ET_INCOME_TAX_BANDS: readonly TaxBand[] = [
  { upTo: 2000, rate: 0, deduction: 0, label: '0 – 2,000' },
  { upTo: 4000, rate: 0.15, deduction: 300, label: '2,001 – 4,000' },
  { upTo: 7000, rate: 0.2, deduction: 500, label: '4,001 – 7,000' },
  { upTo: 10000, rate: 0.25, deduction: 850, label: '7,001 – 10,000' },
  { upTo: 14000, rate: 0.3, deduction: 1350, label: '10,001 – 14,000' },
  { upTo: null, rate: 0.35, deduction: 2050, label: 'over 14,000' },
] as const;

export function taxBandFor(taxableIncome: number): TaxBand {
  const income = Math.max(0, taxableIncome);
  for (const band of ET_INCOME_TAX_BANDS) {
    if (band.upTo === null || income <= band.upTo) return band;
  }
  return ET_INCOME_TAX_BANDS[ET_INCOME_TAX_BANDS.length - 1];
}

/** Monthly employment income tax, rounded to the nearest santim. */
export function ethiopianIncomeTax(taxableIncome: number): number {
  const income = Math.max(0, taxableIncome);
  if (income === 0) return 0;
  const band = taxBandFor(income);
  const tax = income * band.rate - band.deduction;
  // The deduction can exceed the computed tax only for income below the
  // tax-free threshold, which the first band already handles.
  return round2(Math.max(0, tax));
}

export interface PayrollInput {
  basicSalary: number;
  transportAllowance?: number;
  housingAllowance?: number;
  otherAllowance?: number;
  overtime?: number;
  /** Extra deductions such as a salary advance recovery. */
  otherDeductions?: number;
  pensionEligible?: boolean;
}

export interface PayrollBreakdown {
  basicSalary: number;
  allowances: number;
  overtime: number;
  grossPay: number;
  taxableIncome: number;
  incomeTax: number;
  employeePension: number;
  otherDeductions: number;
  netPay: number;
  employerPension: number;
  employerCost: number;
  effectiveTaxRate: number;
}

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

/**
 * Full payslip breakdown for one employee for one month.
 *
 * Allowances are treated as taxable. Housing and transport allowances are
 * taxable in Ethiopia unless they fall within a specific exemption, and the
 * exemption is a policy decision rather than a calculation, so this does not
 * silently exclude them — see the note on `exemptAllowance` below.
 */
export function computePayslip(input: PayrollInput): PayrollBreakdown {
  const basicSalary = round2(Math.max(0, input.basicSalary));
  const allowances = round2(
    Math.max(0, input.transportAllowance ?? 0) +
      Math.max(0, input.housingAllowance ?? 0) +
      Math.max(0, input.otherAllowance ?? 0),
  );
  const overtime = round2(Math.max(0, input.overtime ?? 0));
  const grossPay = round2(basicSalary + allowances + overtime);

  // Taxable income is the gross. Exempt allowances, where an employer has a
  // basis to apply one, must be removed here before this is called.
  const taxableIncome = grossPay;

  const incomeTax = ethiopianIncomeTax(taxableIncome);
  const pensionEligible = input.pensionEligible !== false;
  const employeePension = pensionEligible ? round2(grossPay * PENSION_RATES.employee) : 0;
  const employerPension = pensionEligible ? round2(grossPay * PENSION_RATES.employer) : 0;
  const otherDeductions = round2(Math.max(0, input.otherDeductions ?? 0));

  // Net can legitimately reach zero but not go negative; clamp so a large
  // advance recovery cannot produce a negative payslip.
  const netPay = round2(Math.max(0, grossPay - incomeTax - employeePension - otherDeductions));

  return {
    basicSalary,
    allowances,
    overtime,
    grossPay,
    taxableIncome,
    incomeTax,
    employeePension,
    otherDeductions,
    netPay,
    employerPension,
    // What the month actually costs the company: net pay plus the statutory
    // contributions and the tax withheld, which are remitted on the employee's
    // behalf rather than being a company expense in the ordinary sense but do
    // leave the bank account.
    employerCost: round2(grossPay + employerPension),
    effectiveTaxRate: grossPay > 0 ? round2((incomeTax / grossPay) * 100) : 0,
  };
}

/** Sum a set of breakdowns into payroll-run totals. */
export function totalPayroll(breakdowns: PayrollBreakdown[]) {
  const sum = (pick: (b: PayrollBreakdown) => number) =>
    round2(breakdowns.reduce((a, b) => a + pick(b), 0));
  return {
    employeeCount: breakdowns.length,
    totalGross: sum((b) => b.grossPay),
    totalIncomeTax: sum((b) => b.incomeTax),
    totalEmployeePension: sum((b) => b.employeePension),
    totalOtherDeductions: sum((b) => b.otherDeductions),
    totalNet: sum((b) => b.netPay),
    totalEmployerPension: sum((b) => b.employerPension),
    totalEmployerCost: sum((b) => b.employerCost),
  };
}

export const EMPLOYMENT_TYPE = ['PERMANENT', 'CONTRACT'] as const;
export type EmploymentType = (typeof EMPLOYMENT_TYPE)[number];

export const EMPLOYEE_STATUS = ['Active', 'OnLeave', 'Terminated'] as const;
export const PAYROLL_STATUS = ['Draft', 'Approved', 'Paid'] as const;

/** Contract staff are normally outside the private-sector pension scheme. */
export function defaultPensionEligible(employmentType: string): boolean {
  return employmentType !== 'CONTRACT';
}
