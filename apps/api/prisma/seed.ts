import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import {
  ROLES,
  ROLE_LABELS,
  STATION_STATUS,
  PAYMENT_STATUS,
  COFFEE_PROCESS,
  GRADE,
  EXPENSE_CATEGORY,
  PAYMENT_METHOD,
  SUPPLIER_TYPE,
  SUPPLIER_STATUS,
  INVENTORY_STATUS,
  SALE_PAYMENT_STATUS,
  BATCH_STATUS,
  CURRENCIES,
  COUNTRY_PROFILES,
  ALL_REQUIREMENTS,
  DOCUMENT_TEMPLATES,
} from '@madda/shared';

const prisma = new PrismaClient();

const om: Record<string, string> = {
  Natural: 'Uumamaa',
  Washed: 'Dhiqame',
  Honey: 'Damma',
  Anaerobic: 'Anaerobic',
  Other: 'Kan biraa',
  'Grade 1': 'Sadarkaa 1',
  'Grade 2': 'Sadarkaa 2',
  'Grade 3': 'Sadarkaa 3',
  'Grade 4': 'Sadarkaa 4',
  'Grade 5': 'Sadarkaa 5',
  Active: 'Hojjetamaa',
  Inactive: 'Hojjetaa hin jiru',
  Pending: 'Eegaa',
  Partial: 'Kutaa',
  Paid: 'Kaffalame',
  Cancelled: 'Haqame',
  Labor: 'Hojjetaa',
  Fuel: 'Boba',
  Electricity: 'Ibsa',
  Water: 'Bishaan',
  Transport: 'Geejjiba',
  Packaging: 'Qophii',
  Maintenance: 'Suphaa',
  Security: 'Nageenya',
  Food: 'Nyaata',
  Cash: 'Kaash',
  'Bank Transfer': 'Hannaan Baankii',
  'CBE Birr': 'CBE Birr',
  Farmer: 'Qonnaan bulaa',
  Cooperative: 'Waldaa',
  Collector: 'Funaanii',
  Available: 'Jira',
  Reserved: 'Qabame',
  Sold: 'Gurgurame',
  Damaged: 'Balleeffame',
  Released: 'Gadhiifame',
  Planned: 'Karoorfame',
  Processing: 'Hojjetamaa jira',
  Completed: 'Xumurame',
  'QC Passed': 'QC Darbee',
  Rejected: 'Kufe',
};

async function seedLookups() {
  const groups: { type: string; values: readonly string[] }[] = [
    { type: 'station_status', values: STATION_STATUS },
    { type: 'payment_status', values: PAYMENT_STATUS },
    { type: 'sale_payment_status', values: SALE_PAYMENT_STATUS },
    { type: 'process', values: COFFEE_PROCESS },
    { type: 'grade', values: GRADE },
    { type: 'expense_category', values: EXPENSE_CATEGORY },
    { type: 'payment_method', values: PAYMENT_METHOD },
    { type: 'supplier_type', values: SUPPLIER_TYPE },
    { type: 'supplier_status', values: SUPPLIER_STATUS },
    { type: 'inventory_status', values: INVENTORY_STATUS },
    { type: 'batch_status', values: BATCH_STATUS },
  ];
  let count = 0;
  for (const g of groups) {
    let sort = 0;
    for (const value of g.values) {
      await prisma.lookup.upsert({
        where: { type_code: { type: g.type, code: value } },
        create: { type: g.type, code: value, nameEn: value, nameOm: om[value] ?? null, sort: sort++ },
        update: { nameEn: value, nameOm: om[value] ?? null },
      });
      count++;
    }
  }
  return count;
}

async function seedCurrencies() {
  for (const c of CURRENCIES) {
    await prisma.currency.upsert({
      where: { code: c.code },
      create: { code: c.code, symbol: c.symbol, labelEn: c.label, labelOm: c.labelOm, isBase: c.code === 'ETB' },
      update: { symbol: c.symbol, labelEn: c.label, labelOm: c.labelOm },
    });
  }
  await prisma.exchangeRate.upsert({
    where: { id: 'seed-usd-etb' },
    create: { id: 'seed-usd-etb', fromCode: 'USD', toCode: 'ETB', rate: Number(process.env.USD_TO_ETB ?? 125) },
    update: { rate: Number(process.env.USD_TO_ETB ?? 125) },
  });
}

async function seedRoles() {
  for (const key of ROLES) {
    await prisma.role.upsert({
      where: { key },
      create: { key, label: ROLE_LABELS[key] },
      update: { label: ROLE_LABELS[key] },
    });
  }
}

async function seedAdmin() {
  const email = process.env.SEED_ADMIN_EMAIL || 'admin@madda.local';
  const password = process.env.SEED_ADMIN_PASSWORD || 'Admin@12345';
  const passwordHash = await bcrypt.hash(password, 10);
  const admin = await prisma.user.upsert({
    where: { email },
    create: { name: 'System Administrator', email, passwordHash, language: 'en' },
    update: {},
  });
  const superRole = await prisma.role.findUnique({ where: { key: 'super_admin' } });
  if (superRole) {
    await prisma.userRole.upsert({
      where: { userId_roleId: { userId: admin.id, roleId: superRole.id } },
      create: { userId: admin.id, roleId: superRole.id },
      update: {},
    });
  }
  return { email, password };
}

async function seedStation() {
  await prisma.station.upsert({
    where: { code: 'ST-001' },
    create: {
      code: 'ST-001',
      name: 'Ancient Halo Guji Station',
      region: 'Oromia',
      status: 'Active',
    },
    update: {},
  });
}

/**
 * Country compliance profiles and requirements.
 *
 * Upsert keyed on a natural key rather than cuid, because the schema has no
 * natural unique constraint on (countryCode, name) and re-seeding must be
 * idempotent rather than accumulating duplicates.
 */
async function seedCompliance() {
  const profiles: string[] = [];
  for (const p of COUNTRY_PROFILES) {
    const existing = await prisma.countryComplianceProfile.findFirst({
      where: { countryCode: p.countryCode, market: p.market },
    });
    const data = {
      countryName: p.countryName,
      market: p.market,
      marketBlock: p.marketBlock ?? null,
      customsProcedureCpc: p.customsProcedureCpc ?? null,
      active: true,
      effectiveFrom: new Date('2026-01-01'),
      lastVerifiedAt: p.lastVerifiedAt ? new Date(p.lastVerifiedAt) : null,
      verificationSource: p.verificationSource ?? null,
      notes: p.notes ?? null,
    };
    if (existing) {
      await prisma.countryComplianceProfile.update({ where: { id: existing.id }, data });
    } else {
      await prisma.countryComplianceProfile.create({
        data: { countryCode: p.countryCode, ...data },
      });
    }
    profiles.push(p.countryCode);
  }

  // Map countryCode -> profileId so destination rules can be attached.
  const profileByCountry = new Map<string, string>();
  for (const prof of await prisma.countryComplianceProfile.findMany()) {
    profileByCountry.set(prof.countryCode, prof.id);
  }

  const requirements: string[] = [];
  for (const r of ALL_REQUIREMENTS) {
    const profileId = r.countryCode === '*' ? null : (profileByCountry.get(r.countryCode) ?? null);
    const existing = await prisma.complianceRequirement.findFirst({
      where: { countryCode: r.countryCode, name: r.name },
    });
    const data = {
      profileId,
      marketBlock: r.marketBlock ?? null,
      description: r.description,
      authority: r.authority,
      requirementType: r.requirementType,
      scope: r.scope,
      issuerType: r.issuerType,
      documentType: r.documentType,
      mandatory: r.mandatory,
      conditional: r.conditional,
      triggerConditions: (r.triggerConditions ?? null) as any,
      requiredData: null,
      submissionMethod: r.submissionMethod,
      officialUrl: r.officialUrl ?? null,
      legalBasis: r.legalBasis ?? null,
      leadTimeDays: r.leadTimeDays ?? null,
      validityDays: r.validityDays ?? null,
      appliesToImporter: r.appliesToImporter ?? false,
      notes: r.notes ?? null,
      effectiveFrom: new Date('2026-01-01'),
      lastVerifiedAt: (r as any).lastVerifiedAt ? new Date((r as any).lastVerifiedAt) : null,
      verificationStatus: r.verificationStatus,
      verificationSource: r.verificationSource ?? r.officialUrl ?? null,
    };
    // `data` mixes the profile relation scalar with unchecked columns, which
    // Prisma's generated types cannot express in one object.
    if (existing) {
      await prisma.complianceRequirement.update({ where: { id: existing.id }, data: data as any });
    } else {
      await prisma.complianceRequirement.create({
        data: { countryCode: r.countryCode, name: r.name, ...data } as any,
      });
    }
    requirements.push(r.name);
  }

  // Attach templates to the requirement they describe, where we can match.
  const byDocType = await prisma.complianceRequirement.findMany();
  const templates: string[] = [];
  for (const t of DOCUMENT_TEMPLATES) {
    const match = byDocType.find((x) => x.documentType === t.documentType);
    const existing = await prisma.documentTemplate.findFirst({
      where: { documentType: t.documentType, countryCode: t.countryCode },
    });
    const data = {
      requirementId: match?.id ?? null,
      authority: t.authority,
      templateKind: t.templateKind,
      officialSourceUrl: t.officialSourceUrl ?? null,
      format: t.format,
      versionDate: new Date('2026-09-30'),
      lastVerifiedAt: t.officialSourceUrl ? new Date('2026-09-30') : null,
      notes: t.notes ?? null,
      effectiveFrom: new Date('2026-01-01'),
    };
    if (existing) {
      await prisma.documentTemplate.update({ where: { id: existing.id }, data });
    } else {
      await prisma.documentTemplate.create({
        data: { documentType: t.documentType, countryCode: t.countryCode, ...data },
      });
    }
    templates.push(`${t.documentType} (${t.templateKind})`);
  }

  return { profiles, requirements, templates };
}

async function main() {
  console.log('Seeding MADDA ERP...');
  await seedRoles();
  const lookups = await seedLookups();
  await seedCurrencies();
  const admin = await seedAdmin();
  await seedStation();
  const compliance = await seedCompliance();

  await prisma.setting.upsert({
    where: { key: 'approvals' },
    create: { key: 'approvals', value: { purchase: false, expense: false, payment: false, discount: false, threshold: 0 } },
    update: {},
  });
  await prisma.setting.upsert({
    where: { key: 'organization' },
    create: {
      key: 'organization',
      value: { name: 'Ancient Halo Coffee Export', defaultCurrency: 'ETB', languages: ['en', 'om'] },
    },
    update: {},
  });

  console.log(`  ✓ roles: ${ROLES.length}`);
  console.log(`  ✓ lookups: ${lookups}`);
  console.log(`  ✓ currencies: ${CURRENCIES.length}`);
  console.log(`  ✓ station ST-001`);
  console.log(`  ✓ country profiles: ${compliance.profiles.length} (${compliance.profiles.join(', ')})`);
  console.log(`  ✓ compliance requirements: ${compliance.requirements.length}`);
  console.log(`  ✓ document templates: ${compliance.templates.length}`);
  console.log(`  ✓ admin: ${admin.email} / ${admin.password}`);
  console.log('Done.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
