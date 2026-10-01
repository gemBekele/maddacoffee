// Country compliance vocabulary and the resolution engine.
//
// Design rule: nothing here may present an unverified row as a legal requirement.
// Every rule carries a verificationStatus, and only VERIFIED rules are rendered as
// confirmed facts. The UI badges UNVERIFIED and NEEDS_LOCAL_CHECK separately.

// ───────────────────────────── Vocabularies ─────────────────────────────

/** Which side of the trade a requirement attaches to. */
export const COMPLIANCE_SCOPE = [
  'COMPANY', // permanent licence/registration, held once
  'SHARED', // referenced by many shipments (chamber registration, bank details)
  'SHIPMENT', // one per consignment
  'LOT', // one per coffee lot
  'GOODS', // depends on product form rather than consignment
  'DEST', // destination-country only
] as const;
export type ComplianceScope = (typeof COMPLIANCE_SCOPE)[number];

export const REQUIREMENT_TYPE = [
  'DOCUMENT',
  'CERTIFICATE',
  'DECLARATION',
  'REGISTRATION',
  'LICENSE',
  'INSPECTION',
  'TEST',
  'TRACEABILITY',
  'ELECTRONIC_SUBMISSION',
  'API_SUBMISSION',
  'CUSTOMS',
  'FOOD_SAFETY',
  'PLANT_HEALTH',
  'ORIGIN',
] as const;
export type RequirementType = (typeof REQUIREMENT_TYPE)[number];

/**
 * Who actually produces the document. This is the distinction that stops us
 * rendering an ERP-generated application pack as if it were a government
 * certificate.
 */
export const ISSUER_TYPE = [
  'ERP_GENERATED', // we produce it from shipment data
  'AUTHORITY_ISSUED', // we prepare an application; the authority issues it
  'PRIVATE_PARTY', // carrier, insurer, or the buyer's own agent
] as const;
export type IssuerType = (typeof ISSUER_TYPE)[number];

export const SUBMISSION_METHOD = [
  'PAPER',
  'PDF',
  'ONLINE',
  'ELECTRONIC_DECLARATION',
  'API',
  'CERTIFICATE',
] as const;
export type SubmissionMethod = (typeof SUBMISSION_METHOD)[number];

export const VERIFICATION_STATUS = ['VERIFIED', 'UNVERIFIED', 'NEEDS_LOCAL_CHECK'] as const;
export type VerificationStatus = (typeof VERIFICATION_STATUS)[number];

export const DOCUMENT_STATUS = [
  'NotApplicable',
  'Pending',
  'InProgress',
  'Ready',
  'Submitted',
  'Rejected',
] as const;
export type DocumentStatus = (typeof DOCUMENT_STATUS)[number];

/** What the ERP holds for a document row. */
export const ARTIFACT_KIND = [
  'ERP_DOCUMENT', // a finished document our system produced
  'APPLICATION_DATA', // our data pack, awaiting the authority's certificate
  'AUTHORITY_RECEIPT', // the issued certificate, as received
  'THIRD_PARTY_DOCUMENT', // B/L, insurance, etc.
] as const;
export type ArtifactKind = (typeof ARTIFACT_KIND)[number];

/** Product form. Green vs roasted changes phytosanitary treatment (e.g. Japan). */
export const COFFEE_FORM = ['Green', 'Roasted', 'Soluble', 'Liquid'] as const;
export type CoffeeForm = (typeof COFFEE_FORM)[number];

export const COFFEE_TYPE = ['Arabica', 'Robusta', 'Blend'] as const;

/** Broad market groupings. Requirements can target a market block, not one country. */
export const MARKET = ['EU', 'US_JP_CA', 'AfCFTA', 'GSP', 'OTHER'] as const;
export type Market = (typeof MARKET)[number];

/** Verbatim marker for "applies regardless of destination". */
export const ALL_DESTINATIONS = '*';

// Coffee HS codes. Green unroasted not decaffeinated is 0901.11; 0901.12 is
// decaffeinated green; 0901.21 is roasted not decaffeinated. The classification
// drives several conditional rules, so it lives with the vocabulary rather than
// being hardcoded as a Prisma default.
export const HS_CODES = {
  GREEN: '0901.11',
  GREEN_DECAFF: '0901.12',
  ROASTED: '0901.21',
  ROASTED_DECAFF: '0901.22',
} as const;

export function defaultHsCode(form: string | null | undefined): string {
  if (form === 'Roasted') return HS_CODES.ROASTED;
  return HS_CODES.GREEN;
}

// ───────────────────────────── Trigger conditions ─────────────────────────────
//
// A fixed vocabulary evaluated by a pure function. No eval, no dynamic code. An
// unknown key is an error rather than a silently-ignored field, because a
// misspelled condition that never fires is worse than a visible failure.

export interface TriggerConditions {
  /** Restrict to these product forms. */
  form?: CoffeeForm[];
  /** Restrict to these coffee types. */
  coffeeType?: string[];
  /** Restrict to these processes. */
  process?: string[];
  /** Require organic certification. */
  organic?: boolean;
  /** Restrict to these Incoterms. */
  incoterm?: string[];
  /** Minimum shipment value in USD. */
  valueUsdMin?: number;
  /** Require at least one lot with a cupping score at or above this. */
  cupScoreMin?: number;
  /** Require at least one lot graded at or above this (Grade 1 is best). */
  gradeMin?: number;
  /** Restrict to these buyer countries (ISO-3166 alpha-2). */
  buyerCountries?: string[];
  /** Any plot data linked to the shipment? Drives EUDR-style traceability. */
  requiresPlotData?: boolean;
  /** Restrict to these shipment modes. */
  mode?: string[];
}

export const TRIGGER_KEYS = [
  'form',
  'coffeeType',
  'process',
  'organic',
  'incoterm',
  'valueUsdMin',
  'cupScoreMin',
  'gradeMin',
  'buyerCountries',
  'requiresPlotData',
  'mode',
] as const;
export type TriggerKey = (typeof TRIGGER_KEYS)[number];

export class TriggerConditionError extends Error {
  constructor(
    public readonly key: string,
    message: string,
  ) {
    super(message);
    this.name = 'TriggerConditionError';
  }
}

/** Context a shipment presents to the trigger evaluator. */
export interface TriggerContext {
  form?: string | null;
  coffeeTypes?: string[];
  processes?: string[];
  organic?: boolean;
  incoterm?: string | null;
  valueUsd?: number | null;
  cupScores?: number[];
  grades?: string[];
  buyerCountry?: string | null;
  mode?: string | null;
  hasPlotData?: boolean;
}

/**
 * Numeric grade comparison. GRADE is "Grade 1".."Grade 5" where 1 is best, so a
 * requirement for "grade 3 or better" is a <= comparison, not >=.
 */
export function gradeRank(grade: string | null | undefined): number | null {
  if (!grade) return null;
  const m = /(\d+)/.exec(grade);
  return m ? Number(m[1]) : null;
}

function num(v: unknown): number | null {
  if (v === null || v === undefined || v === '') return null;
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

function asStringArray(v: unknown, key: string): string[] {
  if (!Array.isArray(v)) throw new TriggerConditionError(key, `"${key}" must be an array`);
  return v.map((x) => String(x));
}

/**
 * Evaluate a trigger against a shipment context.
 *
 * Absent condition keys mean "no restriction". A rule with an empty trigger
 * object is unconditional. Throws TriggerConditionError on an unknown key so a
 * typo surfaces at seed time rather than producing a rule that silently never
 * fires.
 */
export function evaluateTriggers(
  conditions: TriggerConditions | null | undefined,
  ctx: TriggerContext,
): { applies: boolean; unmet: string[] } {
  if (!conditions || Object.keys(conditions).length === 0) return { applies: true, unmet: [] };

  const unmet: string[] = [];

  for (const key of Object.keys(conditions)) {
    if (!(TRIGGER_KEYS as readonly string[]).includes(key)) {
      throw new TriggerConditionError(key, `Unknown trigger condition "${key}"`);
    }
  }

  if (conditions.form) {
    const allowed = asStringArray(conditions.form, 'form');
    const actual = ctx.form ?? null;
    if (!actual || !allowed.includes(actual)) unmet.push(`form must be one of ${allowed.join(', ')}`);
  }

  if (conditions.coffeeType) {
    const allowed = asStringArray(conditions.coffeeType, 'coffeeType');
    const actual = ctx.coffeeTypes ?? [];
    if (!actual.some((t) => allowed.includes(t))) unmet.push(`coffeeType must include one of ${allowed.join(', ')}`);
  }

  if (conditions.process) {
    const allowed = asStringArray(conditions.process, 'process');
    const actual = ctx.processes ?? [];
    if (!actual.some((p) => allowed.includes(p))) unmet.push(`process must include one of ${allowed.join(', ')}`);
  }

  if (conditions.organic === true && !ctx.organic) unmet.push('lot must be certified organic');

  if (conditions.incoterm) {
    const allowed = asStringArray(conditions.incoterm, 'incoterm');
    const actual = ctx.incoterm ?? null;
    if (!actual || !allowed.includes(actual)) unmet.push(`incoterm must be one of ${allowed.join(', ')}`);
  }

  if (conditions.valueUsdMin !== undefined) {
    const min = num(conditions.valueUsdMin);
    const actual = num(ctx.valueUsd);
    if (min === null) throw new TriggerConditionError('valueUsdMin', 'valueUsdMin must be numeric');
    if (actual === null || actual < min) unmet.push(`shipment value must be >= ${min} USD`);
  }

  if (conditions.cupScoreMin !== undefined) {
    const min = num(conditions.cupScoreMin);
    if (min === null) throw new TriggerConditionError('cupScoreMin', 'cupScoreMin must be numeric');
    const scores = (ctx.cupScores ?? []).map(num).filter((n): n is number => n !== null);
    if (!scores.length || Math.max(...scores) < min) {
      unmet.push(`at least one lot must have cup score >= ${min}`);
    }
  }

  if (conditions.gradeMin !== undefined) {
    const maxRank = num(conditions.gradeMin);
    if (maxRank === null) throw new TriggerConditionError('gradeMin', 'gradeMin must be numeric');
    const ranks = (ctx.grades ?? []).map(gradeRank).filter((n): n is number => n !== null);
    // "grade 3 or better" means a rank <= 3, because 1 is the best grade.
    if (!ranks.length || Math.min(...ranks) > maxRank) {
      unmet.push(`at least one lot must be grade ${maxRank} or better`);
    }
  }

  if (conditions.buyerCountries) {
    const allowed = asStringArray(conditions.buyerCountries, 'buyerCountries');
    const actual = ctx.buyerCountry ?? null;
    if (!actual || !allowed.includes(actual)) unmet.push(`buyer country must be one of ${allowed.join(', ')}`);
  }

  if (conditions.mode) {
    const allowed = asStringArray(conditions.mode, 'mode');
    const actual = ctx.mode ?? null;
    if (!actual || !allowed.includes(actual)) unmet.push(`mode must be one of ${allowed.join(', ')}`);
  }

  if (conditions.requiresPlotData === true && !ctx.hasPlotData) {
    unmet.push('requires plot-level geolocation data for contributing farms');
  }

  return { applies: unmet.length === 0, unmet };
}

// ───────────────────────────── Resolution ─────────────────────────────

/** The minimum shape the engine needs from a stored requirement row. */
export interface RequirementLike {
  id: string;
  name: string;
  description: string;
  authority: string;
  requirementType: string;
  scope: string;
  issuerType: string;
  documentType: string;
  mandatory: boolean;
  conditional: boolean;
  countryCode: string;
  marketBlock?: string | null;
  triggerConditions?: unknown;
  requiredData?: unknown;
  submissionMethod: string;
  officialUrl?: string | null;
  legalBasis?: string | null;
  leadTimeDays?: number | null;
  validityDays?: number | null;
  appliesToImporter?: boolean;
  effectiveFrom?: Date | string | null;
  effectiveUntil?: Date | string | null;
  verificationStatus?: string | null;
  verificationSource?: string | null;
  notes?: string | null;
}

/** Scope values that are not materialised as per-shipment checklist rows. */
export const NON_SHIPMENT_SCOPES: readonly string[] = ['COMPANY', 'SHARED'];

export interface ResolveInput {
  destinationCountryCode?: string | null;
  destinationMarket?: string | null;
  marketBlock?: string | null;
  /** Date of the shipment; requirements are filtered on their effective window. */
  asOf?: Date;
  context?: TriggerContext;
}

export interface ResolvedRequirement {
  requirement: RequirementLike;
  /** Where this rule matched: exact country, market block, or universal. */
  matchScope: 'COUNTRY' | 'MARKET_BLOCK' | 'UNIVERSAL';
  applies: boolean;
  /** Human-readable reasons a conditional rule did not fire. */
  unmet: string[];
}

function inWindow(r: RequirementLike, asOf: Date): boolean {
  const from = r.effectiveFrom ? new Date(r.effectiveFrom) : null;
  const until = r.effectiveUntil ? new Date(r.effectiveUntil) : null;
  if (from && asOf < from) return false;
  if (until && asOf > until) return false;
  return true;
}

/**
 * Select the requirements that apply to a destination.
 *
 * Precedence is UNIVERAL < MARKET_BLOCK < COUNTRY: a country-specific rule
 * shadows a market-block rule for the same documentType. Rules are returned
 * unresolved-for-triggers when `context` is omitted, which is what the UI's
 * live preview uses before a shipment exists.
 */
export function resolveRequirements(
  requirements: RequirementLike[],
  input: ResolveInput,
): ResolvedRequirement[] {
  const asOf = input.asOf ?? new Date();
  const dest = input.destinationCountryCode ?? null;
  const block = input.marketBlock ?? input.destinationMarket ?? null;

  const matches: { r: RequirementLike; matchScope: ResolvedRequirement['matchScope'] }[] = [];

  for (const r of requirements) {
    if (!inWindow(r, asOf)) continue;

    // Order matters. A rule can carry both countryCode "*" and a marketBlock,
    // which is how EU-wide rules are expressed without duplicating 27 rows. The
    // block must be tested before falling through to UNIVERSAL, otherwise every
    // EU rule would match every destination.
    let matchScope: ResolvedRequirement['matchScope'] | null = null;
    if (dest && r.countryCode === dest) matchScope = 'COUNTRY';
    else if (block && r.marketBlock && r.marketBlock === block) matchScope = 'MARKET_BLOCK';
    else if (r.countryCode === ALL_DESTINATIONS && !r.marketBlock) matchScope = 'UNIVERSAL';

    if (matchScope) matches.push({ r, matchScope });
  }

  const byPrecedence = { UNIVERSAL: 0, MARKET_BLOCK: 1, COUNTRY: 2 } as const;
  matches.sort((a, b) => byPrecedence[a.matchScope] - byPrecedence[b.matchScope]);

  // Country beats market block beats universal for the same documentType.
  const winner = new Map<string, { r: RequirementLike; matchScope: ResolvedRequirement['matchScope'] }>();
  for (const m of matches) {
    const existing = winner.get(m.r.documentType);
    if (!existing || byPrecedence[m.matchScope] > byPrecedence[existing.matchScope]) {
      winner.set(m.r.documentType, m);
    }
  }

  const out: ResolvedRequirement[] = [];
  for (const { r, matchScope } of winner.values()) {
    let applies = true;
    let unmet: string[] = [];
    if (input.context) {
      const res = evaluateTriggers(r.triggerConditions as TriggerConditions, input.context);
      applies = res.applies;
      unmet = res.unmet;
    }
    out.push({ requirement: r, matchScope, applies, unmet });
  }

  // Mandatory first, then by lead time so the long poles lead the list.
  out.sort((a, b) => {
    if (a.requirement.mandatory !== b.requirement.mandatory) return a.requirement.mandatory ? -1 : 1;
    return (b.requirement.leadTimeDays ?? 0) - (a.requirement.leadTimeDays ?? 0);
  });
  return out;
}

/** Checklist rows to materialise for a shipment: mandatory/conditional rules that fired. */
export function toChecklist(resolved: ResolvedRequirement[], scope: string): ResolvedRequirement[] {
  return resolved.filter(
    (x) =>
      x.applies &&
      x.requirement.scope === scope &&
      !NON_SHIPMENT_SCOPES.includes(x.requirement.scope),
  );
}

/** Working days forward from a date. Used for due dates off a leadTimeDays rule. */
export function addWorkingDays(from: Date, days: number): Date {
  const d = new Date(from);
  let left = Math.max(0, Math.round(days));
  while (left > 0) {
    d.setDate(d.getDate() + 1);
    const day = d.getDay();
    if (day !== 0 && day !== 6) left--;
  }
  return d;
}

export function addDays(from: Date, days: number): Date {
  const d = new Date(from);
  d.setDate(d.getDate() + Math.max(0, Math.round(days)));
  return d;
}
