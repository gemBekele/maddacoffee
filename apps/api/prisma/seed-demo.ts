import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import { DOC_TYPES } from '@madda/shared';

const prisma = new PrismaClient();
const year = new Date().getFullYear();
const counters: Record<string, number> = {};

function next(key: string, prefix: string, pad = 4, includeYear = true) {
  counters[key] = (counters[key] ?? 0) + 1;
  return [prefix, includeYear ? year : null, String(counters[key]).padStart(pad, '0')]
    .filter(Boolean)
    .join('-');
}
const daysAgo = (n: number) => new Date(Date.now() - n * 86400000);
const pick = <T>(arr: T[], i: number) => arr[i % arr.length];
const money = (n: number) => Math.round(n * 100) / 100;

async function clear() {
  await prisma.activity.deleteMany();
  await prisma.emailLog.deleteMany();
  await prisma.approval.deleteMany();
  await prisma.shipmentEvent.deleteMany();
  await prisma.shipmentDocument.deleteMany();
  await prisma.shipment.deleteMany();
  await prisma.commercialInvoiceLine.deleteMany();
  await prisma.commercialInvoice.deleteMany();
  await prisma.salesContract.deleteMany();
  await prisma.proformaInvoiceLine.deleteMany();
  await prisma.proformaInvoice.deleteMany();
  await prisma.quotationLine.deleteMany();
  await prisma.quotation.deleteMany();
  await prisma.buyer.deleteMany();
  await prisma.inventoryMovement.deleteMany();
  await prisma.inventoryItem.deleteMany();
  await prisma.processingBatch.deleteMany();
  await prisma.lot.deleteMany();
  await prisma.cherryPurchase.deleteMany();
  await prisma.expense.deleteMany();
  await prisma.payment.deleteMany();
  await prisma.supplier.deleteMany();
  const nonAdmins = await prisma.user.findMany({
    where: { email: { not: 'admin@madda.local' } },
    select: { id: true },
  });
  const nonAdminIds = nonAdmins.map((u) => u.id);
  await prisma.userStation.deleteMany({ where: { userId: { in: nonAdminIds } } });
  await prisma.userRole.deleteMany({ where: { userId: { in: nonAdminIds } } });
  await prisma.user.deleteMany({ where: { email: { not: 'admin@madda.local' } } });
  await prisma.station.deleteMany();
  await prisma.numberSequence.deleteMany();
}

async function main() {
  console.log('Clearing existing data…');
  await clear();

  // ── Stations ──
  const stations = await Promise.all(
    [
      { code: 'ST-001', name: 'Ancient Halo Guji Station', region: 'Oromia', zone: 'Guji', manager: 'Abdi Bekele', capacityTons: 250 },
      { code: 'ST-002', name: 'Ancient Halo Yirgacheffe Station', region: 'SNNP', zone: 'Gedeo', manager: 'Tsedale Alemu', capacityTons: 180 },
      { code: 'ST-003', name: 'Ancient Halo Sidama Station', region: 'Sidama', zone: 'Aleta Wondo', manager: 'Kebede Lensa', capacityTons: 200 },
    ].map((s) => prisma.station.create({ data: { ...s, status: 'Active', startDate: daysAgo(400) } })),
  );
  // keep station numbering consistent
  counters['station'] = stations.length;

  // ── Suppliers ──
  const supplierNames = [
    'Tesfaye Kenea', 'Girma Wolde', 'Aster Hailu', 'Guji Farmers Cooperative',
    'Bekele Abebe', 'Marta Girma', 'Yirgacheffe Union', 'Dawit Mekonnen',
  ];
  const suppliers = [];
  for (let i = 0; i < supplierNames.length; i++) {
    suppliers.push(
      await prisma.supplier.create({
        data: {
          code: next('supplier', 'SUP'),
          name: supplierNames[i],
          type: i === 3 || i === 6 ? 'Cooperative' : i === 2 ? 'Collector' : 'Farmer',
          phone: `+2519${String(10000000 + i * 11111).slice(0, 8)}`,
          location: pick(['Guji', 'Gedeo', 'Sidama', 'Jimma'], i),
          bankInfo: `CBE ${1000000000 + i * 777}`,
          status: 'Active',
        },
      }),
    );
  }

  // ── Buyers ──
  const buyerData = [
    { name: 'Alpine Roasters GmbH', country: 'Germany', contactName: 'Anna Keller', email: 'anna@alpineroasters.de', phone: '+49 30 123456', incoterm: 'FOB', currency: 'USD' },
    { name: 'Nordic Coffee Collective', country: 'Norway', contactName: 'Lars Berg', email: 'lars@nordiccoffee.no', phone: '+47 22 334455', incoterm: 'CIF', currency: 'USD' },
    { name: 'Meridian Trading LLC', country: 'USA', contactName: 'John Carter', email: 'john@meridiantrade.com', phone: '+1 415 555 0100', incoterm: 'FOB', currency: 'USD' },
    { name: 'Sakura Coffee Traders', country: 'Japan', contactName: 'Yuki Tanaka', email: 'yuki@sakuracoffee.jp', phone: '+81 3 9988 7766', incoterm: 'FOB', currency: 'USD' },
  ];
  const buyers = [];
  for (const b of buyerData) buyers.push(await prisma.buyer.create({ data: { ...b, code: next('buyer', 'BUY') } }));

  // ── Cherry purchases ──
  const processes = ['Natural', 'Washed', 'Honey'];
  const purchaseIds: string[] = [];
  for (let i = 0; i < 24; i++) {
    const station = pick(stations, i);
    const supplier = pick(suppliers, i);
    const kg = 300 + ((i * 137) % 900);
    const price = 42 + (i % 9);
    const p = await prisma.cherryPurchase.create({
      data: {
        code: next('purchase', 'PUR'),
        date: daysAgo(150 - i * 6),
        stationId: station.id,
        supplierId: supplier.id,
        receiptNo: `RCP-${1000 + i}`,
        cherryKg: kg,
        pricePerKg: price,
        totalAmount: money(kg * price),
        currency: 'ETB',
        paymentStatus: i % 3 === 0 ? 'Paid' : i % 3 === 1 ? 'Pending' : 'Partial',
        harvestYear: `${year - 1}/${year}`,
      },
    });
    purchaseIds.push(p.id);
  }

  // ── Processing batches + lots + inventory ──
  const lotIds: string[] = [];
  for (let i = 0; i < 10; i++) {
    const station = pick(stations, i);
    const process = pick(processes, i);
    const procurement = 600 + ((i * 211) % 800);
    const green = money(procurement * (process === 'Natural' ? 0.21 : process === 'Washed' ? 0.2 : 0.19));
    const proc3 = process.slice(0, 3).toUpperCase();
    const lotId = `LOT-${station.code}-${proc3}-${String(i + 1).padStart(3, '0')}`;
    lotIds.push(lotId);
    await prisma.lot.create({
      data: {
        lotId,
        stationId: station.id,
        origin: station.region ?? undefined,
        harvestYear: `${year - 1}/${year}`,
        process,
        grade: pick(['Grade 1', 'Grade 2', 'Grade 1', 'Grade 2'], i),
        screenSize: 'Screen 15',
        cuppingScore: 83 + (i % 5),
        status: i < 8 ? 'Active' : 'Exported',
      },
    });
    const completed = i < 8;
    await prisma.processingBatch.create({
      data: {
        code: next('batch', 'BATCH'),
        date: daysAgo(120 - i * 7),
        stationId: station.id,
        lotId,
        process,
        cherryInputKg: procurement,
        parchmentOutputKg: money(procurement * 0.5),
        dryParchmentKg: money(procurement * 0.26),
        greenOutputKg: green,
        moisturePct: 11.2,
        grade: pick(['Grade 1', 'Grade 2'], i),
        screenSize: 'Screen 15',
        cuppingScore: 83 + (i % 5),
        status: completed ? 'Completed' : 'Processing',
      },
    });
    if (completed) {
      const item = await prisma.inventoryItem.create({
        data: {
          lotId,
          stationId: station.id,
          process,
          grade: pick(['Grade 1', 'Grade 2'], i),
          screenSize: 'Screen 15',
          quantityKg: green,
          warehouse: 'Addis Warehouse',
          unitCost: 180 + i * 5,
          currency: 'ETB',
          status: i < 6 ? 'Available' : 'Available',
        },
      });
      await prisma.inventoryMovement.create({
        data: { itemId: item.id, direction: 'IN', quantityKg: green, reference: `BATCH ${lotId}` },
      });
    }
  }

  // ── Users ──
  const pass = await bcrypt.hash('Password@1', 10);
  const roleId = async (k: string) => (await prisma.role.findUnique({ where: { key: k } }))!.id;
  const userSpecs = [
    { name: 'Abdi Bekele', email: 'station@madda.local', role: 'station_manager', station: stations[0].id },
    { name: 'Hanna Getu', email: 'sales@madda.local', role: 'sales_manager', station: null },
    { name: 'Samuel Tadesse', email: 'finance@madda.local', role: 'finance_manager', station: null },
    { name: 'Meron Assefa', email: 'qgrader@madda.local', role: 'qc_officer', station: stations[1].id },
  ];
  for (const u of userSpecs) {
    const created = await prisma.user.create({
      data: {
        name: u.name,
        email: u.email,
        passwordHash: pass,
        language: 'en',
        roles: { create: [{ role: { connect: { id: await roleId(u.role) } } }] },
        ...(u.station ? { stations: { create: [{ station: { connect: { id: u.station } } }] } } : {}),
      },
    });
    void created;
  }

  // Safety: make sure the admin keeps super_admin
  const superRole = await prisma.role.findUnique({ where: { key: 'super_admin' } });
  const adminUser = await prisma.user.findUnique({ where: { email: 'admin@madda.local' } });
  if (superRole && adminUser) {
    await prisma.userRole.upsert({
      where: { userId_roleId: { userId: adminUser.id, roleId: superRole.id } },
      create: { userId: adminUser.id, roleId: superRole.id },
      update: {},
    });
  }

  // ── Quotations ──
  for (let i = 0; i < 3; i++) {
    const buyer = pick(buyers, i);
    const qty = 600 + i * 300;
    const price = 6.3 + i * 0.4;
    await prisma.quotation.create({
      data: {
        code: next('quotation', 'QTN'),
        date: daysAgo(90 - i * 10),
        buyerId: buyer.id,
        currency: 'USD',
        incoterm: 'FOB',
        validUntil: daysAgo(60 - i * 10),
        status: pick(['Sent', 'Accepted', 'Draft'], i),
        lines: { create: [{ lotId: lotIds[i], description: `${pick(processes, i)} ${pick(['Grade 1', 'Grade 2'], i)}`, quantityKg: qty, pricePerKg: price, amount: money(qty * price) }] },
      },
    });
  }

  // ── Proformas (various statuses) ──
  const proformaStatuses = ['Draft', 'Issued', 'Sent', 'Responded', 'Accepted', 'Converted'];
  const proformas = [];
  for (let i = 0; i < proformaStatuses.length; i++) {
    const buyer = pick(buyers, i);
    const qty = 480 + i * 240;
    const price = 6.2 + i * 0.35;
    const pf = await prisma.proformaInvoice.create({
      data: {
        code: next('proforma', 'PRO'),
        date: daysAgo(70 - i * 8),
        buyerId: buyer.id,
        currency: 'USD',
        incoterm: pick(['FOB', 'CIF'], i),
        portLoading: 'Djibouti',
        portDischarge: pick(['Hamburg', 'Oslo', 'Oakland', 'Yokohama'], i),
        validity: daysAgo(40 - i * 8),
        paymentTerms: '30% deposit, 70% against documents',
        status: proformaStatuses[i],
        lines: { create: [{ lotId: lotIds[i], description: `${pick(processes, i)} coffee`, quantityKg: qty, pricePerKg: price, amount: money(qty * price) }] },
      },
    });
    proformas.push(pf);
    await prisma.activity.create({ data: { entity: 'ProformaInvoice', entityId: pf.id, type: 'created', message: `Proforma ${pf.code} created` } });
    if (['Sent', 'Responded', 'Accepted', 'Converted'].includes(proformaStatuses[i])) {
      await prisma.emailLog.create({ data: { to: buyer.email!, subject: `Proforma Invoice ${pf.code} — Ancient Halo Coffee`, template: 'proforma', entity: 'ProformaInvoice', entityId: pf.id, status: 'Queued' } });
      await prisma.activity.create({ data: { entity: 'ProformaInvoice', entityId: pf.id, type: 'email', message: `Emailed to ${buyer.email} (Queued)` } });
    }
  }

  // ── Contracts ──
  const contracts = [];
  for (let i = 0; i < 3; i++) {
    const buyer = pick(buyers, i);
    const c = await prisma.salesContract.create({
      data: {
        code: next('contract', 'CON'),
        date: daysAgo(50 - i * 8),
        buyerId: buyer.id,
        proformaId: proformaStatuses.includes('Converted') && i === 0 ? proformas[5].id : null,
        currency: 'USD',
        incoterm: 'FOB',
        amount: money((1200 + i * 600) * (6.5 + i * 0.3)),
        eptaRef: `ECTA-${year}-${1000 + i}`,
        status: pick(['Signed', 'Registered', 'Completed'], i),
        signedAt: daysAgo(45 - i * 8),
      },
    });
    contracts.push(c);
  }

  // ── Commercial invoices (one from the converted proforma) ──
  const converted = proformas.find((p) => p.status === 'Converted');
  if (converted) {
    const convLines = await prisma.proformaInvoiceLine.findMany({ where: { proformaId: converted.id } });
    const ci = await prisma.commercialInvoice.create({
      data: {
        code: next('commercial', 'COM'),
        date: daysAgo(35),
        buyerId: converted.buyerId,
        proformaId: converted.id,
        currency: converted.currency,
        incoterm: converted.incoterm,
        hsCode: '0901.11',
        status: 'Sent',
        lines: { create: convLines.map((l) => ({ lotId: l.lotId, description: l.description, quantityKg: l.quantityKg, pricePerKg: l.pricePerKg, amount: l.amount })) },
      },
    });
    await prisma.activity.create({ data: { entity: 'CommercialInvoice', entityId: ci.id, type: 'created', message: `Created from proforma ${converted.code}` } });
    await prisma.emailLog.create({ data: { to: (await prisma.buyer.findUnique({ where: { id: converted.buyerId } }))!.email!, subject: `Commercial Invoice ${ci.code}`, template: 'commercial_invoice', entity: 'CommercialInvoice', entityId: ci.id, status: 'Queued' } });
  }
  for (let i = 1; i < 3; i++) {
    const buyer = pick(buyers, i + 1);
    const qty = 900 + i * 300;
    const price = 6.9 + i * 0.3;
    const ci = await prisma.commercialInvoice.create({
      data: {
        code: next('commercial', 'COM'),
        date: daysAgo(28 - i * 6),
        buyerId: buyer.id,
        currency: 'USD',
        incoterm: 'FOB',
        hsCode: '0901.11',
        status: pick(['Issued', 'Paid'], i),
        lines: { create: [{ lotId: lotIds[i + 2], description: 'Washed Grade 1', quantityKg: qty, pricePerKg: price, amount: money(qty * price) }] },
      },
    });
    await prisma.activity.create({ data: { entity: 'CommercialInvoice', entityId: ci.id, type: 'created', message: `Commercial invoice ${ci.code} issued` } });
  }

  // ── Shipments with tracking + documents + events ──
  const trackStates = ['Received', 'In Transit', 'Delivered'];
  for (let i = 0; i < 3; i++) {
    const contract = contracts[i];
    const buyer = await prisma.buyer.findUnique({ where: { id: contract.buyerId } });
    const code = next('shipment', 'SHP');
    const trackingNo = `PAQ-${327 + i}`;
    const trackingStatus = trackStates[i];
    const shipment = await prisma.shipment.create({
      data: {
        code,
        trackingNo,
        contractId: contract.id,
        date: daysAgo(30 - i * 10),
        mode: i === 0 ? 'Sea' : i === 1 ? 'Sea' : 'Air',
        port: i === 2 ? 'Bole Airport' : 'Djibouti',
        containerNo: `MSCU${1000000 + i * 111111}`,
        receiver: buyer?.name,
        address: buyer?.country,
        contact: buyer?.phone ?? buyer?.email,
        itemDescription: 'Ethiopian green coffee (export)',
        note: i === 0 ? 'Fragile' : null,
        status: trackingStatus === 'Delivered' ? 'Delivered' : trackingStatus === 'In Transit' ? 'Shipped' : 'Cleared',
        trackingStatus,
        documents: { create: DOC_TYPES.map((d, k) => ({ docType: d, status: k < (i + 1) * 3 ? 'Ready' : 'Pending' })) },
      },
    });
    const events: { status: string; note: string; location?: string }[] = [
      { status: 'Received', note: 'The consignment was received and registered at the station.', location: 'Station' },
    ];
    if (trackingStatus !== 'Received' || i > 0) {
      events.push({ status: 'In Transit', note: 'The package has reached the local delivery center and is being sorted.', location: 'Djibouti' });
    }
    if (trackingStatus === 'Delivered') {
      events.push({ status: 'Delivered', note: 'The package arrived at the destination and was delivered.', location: buyer?.country ?? 'Destination' });
    }
    for (const ev of events) {
      await prisma.shipmentEvent.create({ data: { shipmentId: shipment.id, status: ev.status, note: ev.note, location: ev.location, createdAt: daysAgo(20 - i * 4) } });
    }
    await prisma.activity.create({ data: { entity: 'Shipment', entityId: shipment.id, type: 'created', message: `Shipment ${code} created (${trackingNo})` } });
  }

  // ── Payments ──
  const payees = ['Tesfaye Kenea', 'Girma Wolde', 'Casual labor crew', 'Ethiopian Shipping Lines', 'Addis Warehouse'];
  for (let i = 0; i < 10; i++) {
    await prisma.payment.create({
      data: {
        code: next('payment', 'PAY'),
        date: daysAgo(100 - i * 8),
        stationId: pick(stations, i).id,
        payee: pick(payees, i),
        type: pick(['Supplier', 'Expense', 'Salary', 'Other'], i),
        amount: 5000 + i * 3200,
        currency: 'ETB',
        method: pick(['Cash', 'Bank Transfer', 'CBE Birr'], i),
        status: i % 4 === 0 ? 'Pending' : 'Paid',
      },
    });
  }

  // ── Expenses ──
  const expenseCats = ['Labor', 'Fuel', 'Electricity', 'Water', 'Transport', 'Packaging', 'Maintenance', 'Security', 'Food'];
  for (let i = 0; i < 18; i++) {
    await prisma.expense.create({
      data: {
        code: next('expense', 'EXP'),
        date: daysAgo(130 - i * 7),
        stationId: pick(stations, i).id,
        category: pick(expenseCats, i),
        description: `${pick(expenseCats, i)} expense`,
        amount: 1500 + (i * 733) % 12000,
        currency: 'ETB',
        paymentStatus: i % 3 === 0 ? 'Pending' : 'Paid',
      },
    });
  }

  // ── Approvals (pending) ──
  await prisma.approval.create({
    data: { entity: 'Expense', entityId: 'demo', code: 'EXP-APPROVAL', summary: 'Fuel: Generator diesel', amount: 8000, currency: 'ETB', status: 'Pending' },
  });
  await prisma.approval.create({
    data: { entity: 'Payment', entityId: 'demo', code: 'PAY-APPROVAL', summary: 'Supplier payment — Tesfaye Kenea', amount: 62000, currency: 'ETB', status: 'Pending' },
  });

  // ── Sync number sequences so future codes continue ──
  const map: Record<string, string> = {
    supplier: 'SUP', buyer: 'BUY', purchase: 'PUR', batch: 'BATCH', payment: 'PAY',
    expense: 'EXP', quotation: 'QTN', proforma: 'PRO', commercial: 'COM', contract: 'CON', shipment: 'SHP',
  };
  for (const [key, prefix] of Object.entries(map)) {
    await prisma.numberSequence.create({
      data: { key, prefix, includeYear: true, padding: 4, reset: 'yearly', current: counters[key] ?? 0, periodTag: String(year) },
    });
  }
  await prisma.numberSequence.create({ data: { key: 'station', prefix: 'ST', includeYear: false, padding: 3, reset: 'never', current: stations.length, periodTag: '' } });

  console.log('Demo data seeded:');
  console.log(`  stations=${stations.length} suppliers=${suppliers.length} buyers=${buyers.length}`);
  console.log(`  purchases=${counters['purchase']} batches=${counters['batch']} lots=${lotIds.length}`);
  console.log(`  proformas=${counters['proforma']} commercial=${counters['commercial']} contracts=${counters['contract']} shipments=${counters['shipment']}`);
  console.log(`  payments=${counters['payment']} expenses=${counters['expense']}`);
  console.log('Logins: admin@madda.local / Admin@12345 (and sales@, finance@, station@ / Password@1)');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
