/**
 * Payroll calculation tests.
 *
 * Run: npx ts-node --compiler-options '{"module":"CommonJS"}' src/payroll.test.ts
 *
 * Payroll errors are not cosmetic — they are a legal liability and they land on
 * someone's payslip — so the band boundaries and the order of the pension
 * deduction are pinned explicitly here.
 */
import assert from 'node:assert/strict';
import {
  ethiopianIncomeTax,
  computePayslip,
  taxBandFor,
  totalPayroll,
  defaultPensionEligible,
} from './payroll';

let passed = 0;
function test(name: string, fn: () => void) {
  try {
    fn();
    passed++;
    console.log(`  ok  ${name}`);
  } catch (e) {
    console.error(`  FAIL ${name}`);
    console.error(`       ${(e as Error).message}`);
    process.exitCode = 1;
  }
}

console.log('\nincome tax bands');

test('income at or below the threshold is tax free', () => {
  assert.equal(ethiopianIncomeTax(0), 0);
  assert.equal(ethiopianIncomeTax(1500), 0);
  assert.equal(ethiopianIncomeTax(2000), 0);
});

test('the tax-free band does not bleed into the next one', () => {
  // 2,001 x 15% - 300 = 0.15, i.e. tax starts from almost nothing.
  assert.equal(ethiopianIncomeTax(2001), 0.15);
});

test('each band boundary is continuous', () => {
  // A progressive-band implementation jumps at each step. The rate-minus-
  // deduction formulation does not, and these figures are the check.
  assert.equal(ethiopianIncomeTax(4000), 300); // 4000*.15-300
  assert.equal(ethiopianIncomeTax(4001), 300.2); // 4001*.20-500
  assert.equal(ethiopianIncomeTax(7000), 900); // 7000*.20-500
  assert.equal(ethiopianIncomeTax(7001), 900.25); // 7001*.25-850
  assert.equal(ethiopianIncomeTax(10000), 1650); // 10000*.25-850
  assert.equal(ethiopianIncomeTax(10001), 1650.3); // 10001*.30-1350
  assert.equal(ethiopianIncomeTax(14000), 2850); // 14000*.30-1350
  assert.equal(ethiopianIncomeTax(14001), 2850.35); // 14001*.35-2050
});

test('the top band applies above 14,000', () => {
  assert.equal(ethiopianIncomeTax(20000), 20000 * 0.35 - 2050);
});

test('band selection is correct at the edges', () => {
  assert.equal(taxBandFor(2000).rate, 0);
  assert.equal(taxBandFor(2001).rate, 0.15);
  assert.equal(taxBandFor(14001).rate, 0.35);
});

test('negative income does not produce negative tax', () => {
  assert.equal(ethiopianIncomeTax(-500), 0);
});

console.log('\npayslip');

test('permanent employee: tax on gross, pension withheld after tax', () => {
  // 10,000 gross. Tax = 10000*.25-850 = 1,650. Pension = 7% = 700.
  // Net = 10000 - 1650 - 700 = 7,650.
  const p = computePayslip({ basicSalary: 10000, pensionEligible: true });
  assert.equal(p.grossPay, 10000);
  assert.equal(p.incomeTax, 1650);
  assert.equal(p.employeePension, 700);
  assert.equal(p.netPay, 7650);
  assert.equal(p.employerPension, 1100);
});

test('pension is NOT deducted before tax', () => {
  // If pension were pre-tax the tax would be (10000-700)*.25-850 = 1,475.
  // It must be 1,650.
  const p = computePayslip({ basicSalary: 10000, pensionEligible: true });
  assert.notEqual(p.incomeTax, 1475);
  assert.equal(p.incomeTax, 1650);
});

test('contract employee with no pension keeps the full 7%', () => {
  const p = computePayslip({ basicSalary: 10000, pensionEligible: false });
  assert.equal(p.employeePension, 0);
  assert.equal(p.employerPension, 0);
  assert.equal(p.netPay, 8350); // 10000 - 1650
});

test('allowances are taxable and are included in gross', () => {
  const p = computePayslip({
    basicSalary: 8000,
    transportAllowance: 1000,
    housingAllowance: 500,
    pensionEligible: false,
  });
  assert.equal(p.allowances, 1500);
  assert.equal(p.grossPay, 9500);
  assert.equal(p.taxableIncome, 9500);
});

test('overtime is added to gross', () => {
  const p = computePayslip({ basicSalary: 5000, overtime: 500, pensionEligible: false });
  assert.equal(p.grossPay, 5500);
});

test('other deductions reduce net pay', () => {
  const base = computePayslip({ basicSalary: 6000, pensionEligible: false });
  const withAdvance = computePayslip({ basicSalary: 6000, pensionEligible: false, otherDeductions: 1000 });
  assert.equal(withAdvance.netPay, base.netPay - 1000);
});

test('net pay never goes negative', () => {
  const p = computePayslip({ basicSalary: 3000, pensionEligible: true, otherDeductions: 99999 });
  assert.equal(p.netPay, 0);
});

test('employer cost is gross plus the employer contribution', () => {
  const p = computePayslip({ basicSalary: 10000, pensionEligible: true });
  assert.equal(p.employerCost, 11100);
});

test('a below-threshold salary pays no tax but still contributes pension', () => {
  const p = computePayslip({ basicSalary: 1800, pensionEligible: true });
  assert.equal(p.incomeTax, 0);
  assert.equal(p.employeePension, 126);
  assert.equal(p.netPay, 1674);
});

test('figures round to santim', () => {
  const p = computePayslip({ basicSalary: 3333.33, pensionEligible: true });
  // 3333.33 * 0.07 = 233.3331 -> 233.33
  assert.equal(p.employeePension, 233.33);
  assert.equal(Number.isInteger(Math.round(p.netPay * 100)), true);
});

console.log('\ntotals');

test('run totals sum the lines', () => {
  const a = computePayslip({ basicSalary: 10000, pensionEligible: true });
  const b = computePayslip({ basicSalary: 5000, pensionEligible: false });
  const t = totalPayroll([a, b]);
  assert.equal(t.employeeCount, 2);
  assert.equal(t.totalGross, 15000);
  assert.equal(t.totalIncomeTax, a.incomeTax + b.incomeTax);
  assert.equal(t.totalNet, a.netPay + b.netPay);
  assert.equal(t.totalEmployerCost, a.employerCost + b.employerCost);
});

test('net plus deductions equals gross for each line', () => {
  for (const salary of [1200, 3000, 4500, 8500, 12000, 25000]) {
    const p = computePayslip({ basicSalary: salary, pensionEligible: true });
    const accounted = p.netPay + p.incomeTax + p.employeePension + p.otherDeductions;
    assert.ok(
      Math.abs(accounted - p.grossPay) < 0.02,
      `gross ${p.grossPay} != net+deductions ${accounted} at salary ${salary}`,
    );
  }
});

console.log('\ndefaults');

test('contract employees default to no pension, permanent to pension', () => {
  assert.equal(defaultPensionEligible('PERMANENT'), true);
  assert.equal(defaultPensionEligible('CONTRACT'), false);
});

console.log(`\n${passed} passed\n`);
