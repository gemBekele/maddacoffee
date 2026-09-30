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

async function main() {
  console.log('Seeding MADDA ERP...');
  await seedRoles();
  const lookups = await seedLookups();
  await seedCurrencies();
  const admin = await seedAdmin();
  await seedStation();

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
