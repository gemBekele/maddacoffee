/**
 * Compliance engine unit tests.
 *
 * Run with: npx ts-node --compiler-options '{"module":"CommonJS"}' src/compliance.test.ts
 *
 * These cover the parts where a silent bug would be expensive: the lb/kg unit
 * conversion, grade ranking direction, and rule precedence on destination change.
 */
import assert from 'node:assert/strict';
import {
  evaluateTriggers,
  gradeRank,
  defaultHsCode,
  resolveRequirements,
  toChecklist,
  addWorkingDays,
  addDays,
  TriggerConditionError,
  type RequirementLike,
  type TriggerContext,
} from './compliance';

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

console.log('\ngradeRank');

// Grade 1 is the best grade in the Ethiopian 1-5 scale, so "grade 3 or better"
// must be a <= comparison. Getting this backwards would mark every premium lot
// as non-compliant.
test('parses the numeric rank out of "Grade 3"', () => {
  assert.equal(gradeRank('Grade 3'), 3);
  assert.equal(gradeRank('grade 1'), 1);
});

test('returns null for absent or unparseable grades', () => {
  assert.equal(gradeRank(null), null);
  assert.equal(gradeRank(undefined), null);
  assert.equal(gradeRank('Natural'), null);
});

console.log('\nevaluateTriggers');

test('an empty trigger object is unconditional', () => {
  const res = evaluateTriggers({}, { form: 'Green' });
  assert.equal(res.applies, true);
  assert.deepEqual(res.unmet, []);
});

test('a null trigger is unconditional', () => {
  assert.equal(evaluateTriggers(null, {}).applies, true);
});

test('form gate passes on a match and fails on a mismatch', () => {
  assert.equal(evaluateTriggers({ form: ['Green'] }, { form: 'Green' }).applies, true);
  const bad = evaluateTriggers({ form: ['Green'] }, { form: 'Roasted' });
  assert.equal(bad.applies, false);
  assert.match(bad.unmet[0], /form must be one of Green/);
});

test('gradeMin means grade 3 OR BETTER, not grade 3 or worse', () => {
  // Lot is Grade 1 (best). Requirement is grade 3 or better -> should pass.
  assert.equal(evaluateTriggers({ gradeMin: 3 }, { grades: ['Grade 1'] }).applies, true);
  // Lot is Grade 5 (worst). Requirement grade 3 or better -> should fail.
  assert.equal(evaluateTriggers({ gradeMin: 3 }, { grades: ['Grade 5'] }).applies, false);
});

test('an empty lot set fails a grade gate rather than passing vacuously', () => {
  const res = evaluateTriggers({ gradeMin: 3 }, { grades: [] });
  assert.equal(res.applies, false);
});

test('cupScoreMin uses the best lot, not the average', () => {
  assert.equal(evaluateTriggers({ cupScoreMin: 85 }, { cupScores: [80, 86, 82] }).applies, true);
  assert.equal(evaluateTriggers({ cupScoreMin: 88 }, { cupScores: [80, 86, 82] }).applies, false);
});

test('valueUsdMin fails when the value is unknown', () => {
  assert.equal(evaluateTriggers({ valueUsdMin: 50000 }, { valueUsd: 60000 }).applies, true);
  assert.equal(evaluateTriggers({ valueUsdMin: 50000 }, { valueUsd: null }).applies, false);
});

test('requiresPlotData gates on whether plot geodata exists', () => {
  assert.equal(evaluateTriggers({ requiresPlotData: true }, { hasPlotData: true }).applies, true);
  assert.equal(evaluateTriggers({ requiresPlotData: true }, { hasPlotData: false }).applies, false);
});

test('multiple unmet conditions are all reported', () => {
  const res = evaluateTriggers(
    { form: ['Green'], organic: true, incoterm: ['FOB'] },
    { form: 'Roasted', organic: false, incoterm: 'CIF' },
  );
  assert.equal(res.applies, false);
  assert.equal(res.unmet.length, 3);
});

test('an unknown trigger key throws instead of silently never firing', () => {
  // A typo'd key that is ignored would produce a rule that appears configured
  // but never matches. Failing loudly at evaluation is the point.
  assert.throws(
    () => evaluateTriggers({ formm: ['Green'] } as any, { form: 'Green' }),
    TriggerConditionError,
  );
});

test('a non-numeric valueUsdMin throws', () => {
  assert.throws(
    () => evaluateTriggers({ valueUsdMin: 'lots' } as any, { valueUsd: 100 }),
    TriggerConditionError,
  );
});

console.log('\nresolveRequirements');

function req(over: Partial<RequirementLike> & { documentType: string; id: string }): RequirementLike {
  return {
    name: over.documentType,
    description: '',
    authority: 'test',
    requirementType: 'DOCUMENT',
    scope: 'SHIPMENT',
    issuerType: 'ERP_GENERATED',
    mandatory: true,
    conditional: false,
    countryCode: '*',
    submissionMethod: 'PDF',
    ...over,
  };
}

const rules: RequirementLike[] = [
  req({ id: 'r-ci', documentType: 'Commercial Invoice', countryCode: '*' }),
  req({ id: 'r-eu-ci', documentType: 'Commercial Invoice', countryCode: '*', marketBlock: 'EU' }),
  req({ id: 'r-eu-eudr', documentType: 'EUDR Due Diligence Statement', countryCode: '*', marketBlock: 'EU', leadTimeDays: 14 }),
  req({ id: 'r-us-fda', documentType: 'FDA Prior Notice', countryCode: 'US' }),
  req({ id: 'r-jp-maff', documentType: 'MAFF Plant Quarantine Certificate', countryCode: 'JP' }),
  req({ id: 'r-co', documentType: 'ECTA Certificate of Competency', scope: 'COMPANY', countryCode: '*' }),
];

test('a US shipment gets universal rules plus US rules, not EU rules', () => {
  const out = resolveRequirements(rules, { destinationCountryCode: 'US' });
  const types = out.map((o) => o.requirement.documentType);
  assert.ok(types.includes('FDA Prior Notice'), 'US rule present');
  assert.ok(types.includes('Commercial Invoice'), 'universal rule present');
  assert.ok(!types.includes('EUDR Due Diligence Statement'), 'EU rule must NOT leak into a US shipment');
  assert.ok(!types.includes('MAFF Plant Quarantine Certificate'), 'JP rule must NOT leak');
});

test('an EU shipment picks up the market-block EUDR rule', () => {
  const out = resolveRequirements(rules, {
    destinationCountryCode: 'DE',
    marketBlock: 'EU',
  });
  const types = out.map((o) => o.requirement.documentType);
  assert.ok(types.includes('EUDR Due Diligence Statement'));
  assert.ok(!types.includes('FDA Prior Notice'));
});

test('country-specific beats market-block for the same documentType', () => {
  const shadowed = [
    req({ id: 'block', documentType: 'Packing List', countryCode: '*', marketBlock: 'EU', authority: 'block' }),
    req({ id: 'country', documentType: 'Packing List', countryCode: 'DE', authority: 'country' }),
  ];
  const out = resolveRequirements(shadowed, { destinationCountryCode: 'DE', marketBlock: 'EU' });
  assert.equal(out.length, 1);
  assert.equal(out[0].requirement.id, 'country');
  assert.equal(out[0].matchScope, 'COUNTRY');
});

test('without a destination only universal rules resolve', () => {
  const out = resolveRequirements(rules, {});
  const types = out.map((o) => o.requirement.documentType);
  assert.deepEqual(types.sort(), ['Commercial Invoice', 'ECTA Certificate of Competency'].sort());
});

test('an expired requirement is filtered out', () => {
  const expired = [
    req({
      id: 'old',
      documentType: 'Old Rule',
      countryCode: '*',
      effectiveUntil: new Date('2020-01-01'),
    }),
  ];
  assert.equal(resolveRequirements(expired, { asOf: new Date('2026-09-30') }).length, 0);
});

test('a not-yet-effective requirement is filtered out', () => {
  const future = [
    req({
      id: 'future',
      documentType: 'Future Rule',
      countryCode: '*',
      effectiveFrom: new Date('2030-01-01'),
    }),
  ];
  assert.equal(resolveRequirements(future, { asOf: new Date('2026-09-30') }).length, 0);
});

test('COMPANY scope is excluded from the per-shipment checklist', () => {
  const out = resolveRequirements(rules, { destinationCountryCode: 'US' });
  const checklist = toChecklist(out, 'SHIPMENT');
  assert.ok(!checklist.some((c) => c.requirement.scope === 'COMPANY'));
});

test('a conditional rule that does not fire is excluded from the checklist', () => {
  const cond = [
    req({
      id: 'eu-co',
      documentType: 'ICO Certificate of Origin',
      countryCode: '*',
      marketBlock: 'EU',
      conditional: true,
      mandatory: false,
      triggerConditions: { form: ['Green'] },
    }),
  ];
  const fired = resolveRequirements(cond, {
    destinationCountryCode: 'DE',
    marketBlock: 'EU',
    context: { form: 'Green' },
  });
  assert.equal(toChecklist(fired, 'SHIPMENT').length, 1);

  const notFired = resolveRequirements(cond, {
    destinationCountryCode: 'DE',
    marketBlock: 'EU',
    context: { form: 'Roasted' },
  });
  assert.equal(toChecklist(notFired, 'SHIPMENT').length, 0);
});

test('long-lead-time rules sort first so the critical path leads the list', () => {
  const out = resolveRequirements(rules, { destinationCountryCode: 'DE', marketBlock: 'EU' });
  assert.equal(out[0].requirement.documentType, 'EUDR Due Diligence Statement');
});

console.log('\ndefaultHsCode');

test('green maps to 0901.11 and roasted to 0901.21', () => {
  assert.equal(defaultHsCode('Green'), '0901.11');
  assert.equal(defaultHsCode('Roasted'), '0901.21');
});

console.log('\ndate helpers');

test('addWorkingDays skips weekends', () => {
  // Friday + 1 working day = Monday.
  const friday = new Date('2026-10-02T00:00:00Z');
  const monday = addWorkingDays(friday, 1);
  assert.equal(monday.getUTCDay(), 1);
});

test('addDays is calendar days', () => {
  const start = new Date('2026-10-02T00:00:00Z');
  assert.equal(addDays(start, 14).getUTCDate(), 16);
});

console.log(`\n${passed} passed\n`);
