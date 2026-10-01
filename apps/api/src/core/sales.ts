import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../common/audit.service';
import { NumberingService } from '../common/numbering.service';
import { EmailService } from '../common/email.service';
import { ActivityService } from '../common/activity.service';
import { ComplianceService } from './compliance.service';
import { RequirePermissions, CurrentUser, type AuthUser } from '../common/decorators';
import { ZodValidationPipe } from '../common/zod.pipe';
import {
  buyerSchema,
  quotationSchema,
  proformaSchema,
  contractSchema,
  shipmentSchema,
  type BuyerInput,
  type QuotationInput,
  type ProformaInput,
  type ContractInput,
  type ShipmentInput,
  formatMoney,
  addDays,
} from '@madda/shared';

const linesTotal = (lines: any[]) =>
  lines.reduce((a, l) => a + Number(l.quantityKg) * Number(l.pricePerKg), 0);

// ───────────────────────────── Buyers ─────────────────────────────

@Controller('buyers')
export class BuyersController {
  constructor(private prisma: PrismaService, private audit: AuditService, private numbering: NumberingService) {}

  @Get()
  @RequirePermissions('buyer.read')
  list(@Query('search') search?: string) {
    return this.prisma.buyer.findMany({
      where: search ? { name: { contains: search, mode: 'insensitive' } } : {},
      orderBy: { createdAt: 'desc' },
      take: 500,
      include: { _count: { select: { proformas: true, commercialInvoices: true } } },
    });
  }

  @Get(':id')
  @RequirePermissions('buyer.read')
  one(@Param('id') id: string) {
    return this.prisma.buyer.findUnique({
      where: { id },
      include: {
        proformas: { include: { lines: true }, orderBy: { date: 'desc' } },
        commercialInvoices: { include: { lines: true }, orderBy: { date: 'desc' } },
        contracts: { orderBy: { date: 'desc' } },
      },
    });
  }

  @Post()
  @RequirePermissions('buyer.write')
  async create(@Body(new ZodValidationPipe(buyerSchema)) body: BuyerInput, @CurrentUser() actor: AuthUser) {
    const code = await this.numbering.next('buyer');
    const buyer = await this.prisma.buyer.create({ data: { ...body, code } as any });
    await this.audit.log({ userId: actor.id, action: 'CREATE', entity: 'Buyer', entityId: buyer.id });
    return buyer;
  }

  @Patch(':id')
  @RequirePermissions('buyer.write')
  update(@Param('id') id: string, @Body() body: Partial<BuyerInput>) {
    return this.prisma.buyer.update({ where: { id }, data: body as any });
  }
}

// ───────────────────────────── Quotations ─────────────────────────────

@Controller('quotations')
export class QuotationsController {
  constructor(private prisma: PrismaService, private audit: AuditService, private numbering: NumberingService) {}

  @Get()
  @RequirePermissions('quotation.read')
  list() {
    return this.prisma.quotation.findMany({ include: { buyer: true, lines: true }, orderBy: { date: 'desc' }, take: 500 });
  }

  @Get(':id')
  @RequirePermissions('quotation.read')
  one(@Param('id') id: string) {
    return this.prisma.quotation.findUnique({ where: { id }, include: { buyer: true, lines: true } });
  }

  @Post()
  @RequirePermissions('quotation.write')
  async create(@Body(new ZodValidationPipe(quotationSchema)) body: QuotationInput, @CurrentUser() actor: AuthUser) {
    const code = await this.numbering.next('quotation', body.date);
    const q = await this.prisma.quotation.create({
      data: {
        code,
        date: body.date,
        buyerId: body.buyerId,
        currency: body.currency,
        incoterm: body.incoterm,
        validUntil: body.validUntil ?? null,
        notes: body.notes ?? null,
        lines: {
          create: body.lines.map((l) => ({
            lotId: l.lotId ?? null,
            description: l.description,
            quantityKg: l.quantityKg,
            pricePerKg: l.pricePerKg,
            amount: Number(l.quantityKg) * Number(l.pricePerKg),
          })),
        },
      },
      include: { lines: true },
    });
    await this.audit.log({ userId: actor.id, action: 'CREATE', entity: 'Quotation', entityId: q.id });
    return q;
  }

  @Patch(':id/status')
  @RequirePermissions('quotation.write')
  async setStatus(@Param('id') id: string, @Body('status') status: string) {
    return this.prisma.quotation.update({ where: { id }, data: { status } });
  }
}

// ───────────────────────────── Proforma invoices ─────────────────────────────

@Controller('proformas')
export class ProformasController {
  constructor(
    private prisma: PrismaService,
    private audit: AuditService,
    private numbering: NumberingService,
    private email: EmailService,
    private activity: ActivityService,
  ) {}

  @Get()
  @RequirePermissions('proforma.read')
  list() {
    return this.prisma.proformaInvoice.findMany({
      include: { buyer: true, lines: true },
      orderBy: { date: 'desc' },
      take: 500,
    });
  }

  @Get(':id')
  @RequirePermissions('proforma.read')
  one(@Param('id') id: string) {
    return this.prisma.proformaInvoice.findUnique({
      where: { id },
      include: { buyer: true, lines: true, contract: true, commercial: true },
    });
  }

  @Post()
  @RequirePermissions('proforma.write')
  async create(@Body(new ZodValidationPipe(proformaSchema)) body: ProformaInput, @CurrentUser() actor: AuthUser) {
    const code = await this.numbering.next('proforma', body.date);
    const pf = await this.prisma.proformaInvoice.create({
      data: {
        code,
        date: body.date,
        buyerId: body.buyerId,
        quotationId: body.quotationId ?? null,
        currency: body.currency,
        incoterm: body.incoterm,
        portLoading: body.portLoading ?? null,
        portDischarge: body.portDischarge ?? null,
        validity: body.validity ?? null,
        paymentTerms: body.paymentTerms ?? null,
        notes: body.notes ?? null,
        status: 'Draft',
        lines: {
          create: body.lines.map((l) => ({
            lotId: l.lotId ?? null,
            description: l.description,
            quantityKg: l.quantityKg,
            pricePerKg: l.pricePerKg,
            amount: Number(l.quantityKg) * Number(l.pricePerKg),
          })),
        },
      },
      include: { lines: true, buyer: true },
    });
    await this.audit.log({ userId: actor.id, action: 'CREATE', entity: 'ProformaInvoice', entityId: pf.id });
    await this.activity.log('ProformaInvoice', pf.id, 'created', `Proforma ${pf.code} created`, actor.id);
    return pf;
  }

  @Patch(':id/status')
  @RequirePermissions('proforma.write')
  async setStatus(@Param('id') id: string, @Body('status') status: string, @CurrentUser() actor: AuthUser) {
    const pf = await this.prisma.proformaInvoice.update({ where: { id }, data: { status } });
    await this.audit.log({ userId: actor.id, action: `STATUS:${status}`, entity: 'ProformaInvoice', entityId: id });
    await this.activity.log('ProformaInvoice', id, 'status', `Status changed to ${status}`, actor.id);
    return pf;
  }

  /** Email the proforma to the buyer. */
  @Post(':id/send')
  @RequirePermissions('proforma.send')
  async send(@Param('id') id: string, @CurrentUser() actor: AuthUser) {
    const pf = await this.prisma.proformaInvoice.findUnique({ where: { id }, include: { buyer: true, lines: true } });
    if (!pf?.buyer?.email) return { status: 'Failed', error: 'Buyer has no email address' };
    const total = linesTotal(pf.lines);
    const rows = pf.lines
      .map((l) => `<tr><td>${l.description}</td><td>${l.quantityKg} kg</td><td>${l.pricePerKg}</td><td>${formatMoney(Number(l.amount), pf.currency)}</td></tr>`)
      .join('');
    const html = `<h2>Proforma Invoice ${pf.code}</h2>
      <p>Dear ${pf.buyer.name},</p>
      <p>Please find our proforma invoice below (${pf.incoterm}, ${pf.currency}).</p>
      <table border="1" cellpadding="6" cellspacing="0">
        <thead><tr><th>Description</th><th>Qty</th><th>Unit price</th><th>Amount</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
      <p><b>Total: ${formatMoney(total, pf.currency)}</b></p>
      ${pf.validity ? `<p>Valid until: ${new Date(pf.validity).toLocaleDateString()}</p>` : ''}
      <p>Kind regards,<br/>Ancient Halo Coffee Export</p>`;
    const res = await this.email.send({
      to: pf.buyer.email,
      subject: `Proforma Invoice ${pf.code} — Ancient Halo Coffee`,
      html,
      template: 'proforma',
      entity: 'ProformaInvoice',
      entityId: pf.id,
      userId: actor.id,
    });
    if (res.status !== 'Failed') {
      await this.prisma.proformaInvoice.update({ where: { id }, data: { status: 'Sent' } });
      await this.activity.log('ProformaInvoice', id, 'email', `Emailed to ${pf.buyer.email} (${res.status})`, actor.id);
    } else {
      await this.activity.log('ProformaInvoice', id, 'email', `Email failed: ${res.error}`, actor.id);
    }
    return res;
  }

  /** Convert a proforma into a commercial invoice (keeps the proforma reference). */
  @Post(':id/convert')
  @RequirePermissions('commercial.write')
  async convert(@Param('id') id: string, @CurrentUser() actor: AuthUser) {
    const pf = await this.prisma.proformaInvoice.findUnique({ where: { id }, include: { lines: true } });
    if (!pf) return { error: 'Not found' };
    if (pf.status === 'Converted') {
      const existing = await this.prisma.commercialInvoice.findFirst({ where: { proformaId: id } });
      if (existing) return existing;
    }
    const code = await this.numbering.next('commercial', pf.date);
    const inv = await this.prisma.commercialInvoice.create({
      data: {
        code,
        date: new Date(),
        buyerId: pf.buyerId,
        proformaId: pf.id,
        currency: pf.currency,
        incoterm: pf.incoterm,
        status: 'Draft',
        lines: {
          create: pf.lines.map((l) => ({
            lotId: l.lotId,
            description: l.description,
            quantityKg: l.quantityKg,
            pricePerKg: l.pricePerKg,
            amount: l.amount,
          })),
        },
      },
      include: { lines: true },
    });
    await this.prisma.proformaInvoice.update({ where: { id }, data: { status: 'Converted' } });
    await this.audit.log({ userId: actor.id, action: 'CONVERT', entity: 'CommercialInvoice', entityId: inv.id });
    await this.activity.log('ProformaInvoice', id, 'status', `Converted to commercial invoice ${inv.code}`, actor.id);
    await this.activity.log('CommercialInvoice', inv.id, 'created', `Created from proforma ${pf.code}`, actor.id);
    return inv;
  }
}

// ───────────────────────────── Contracts ─────────────────────────────

@Controller('contracts')
export class ContractsController {
  constructor(private prisma: PrismaService, private audit: AuditService, private numbering: NumberingService) {}

  @Get()
  @RequirePermissions('contract.read')
  list() {
    return this.prisma.salesContract.findMany({ include: { buyer: true, proforma: true, shipment: true }, orderBy: { date: 'desc' }, take: 500 });
  }

  @Post()
  @RequirePermissions('contract.write')
  async create(@Body(new ZodValidationPipe(contractSchema)) body: ContractInput, @CurrentUser() actor: AuthUser) {
    const code = await this.numbering.next('contract', body.date);
    const c = await this.prisma.salesContract.create({
      data: {
        code,
        date: body.date,
        buyerId: body.buyerId,
        proformaId: body.proformaId ?? null,
        currency: body.currency,
        incoterm: body.incoterm,
        amount: body.amount,
        eptaRef: body.eptaRef ?? null,
        notes: body.notes ?? null,
        status: 'Draft',
      },
    });
    await this.audit.log({ userId: actor.id, action: 'CREATE', entity: 'SalesContract', entityId: c.id });
    return c;
  }

  @Patch(':id/status')
  @RequirePermissions('contract.write')
  setStatus(@Param('id') id: string, @Body('status') status: string) {
    return this.prisma.salesContract.update({ where: { id }, data: { status, ...(status === 'Signed' ? { signedAt: new Date() } : {}) } });
  }
}

// ───────────────────────────── Commercial invoices ─────────────────────────────

@Controller('commercial-invoices')
export class CommercialController {
  constructor(
    private prisma: PrismaService,
    private audit: AuditService,
    private email: EmailService,
    private activity: ActivityService,
  ) {}

  @Get()
  @RequirePermissions('commercial.read')
  list() {
    return this.prisma.commercialInvoice.findMany({ include: { buyer: true, lines: true }, orderBy: { date: 'desc' }, take: 500 });
  }

  @Get(':id')
  @RequirePermissions('commercial.read')
  one(@Param('id') id: string) {
    return this.prisma.commercialInvoice.findUnique({ where: { id }, include: { buyer: true, lines: true, proforma: true } });
  }

  @Patch(':id/status')
  @RequirePermissions('commercial.write')
  setStatus(@Param('id') id: string, @Body('status') status: string, @CurrentUser() actor: AuthUser) {
    return this.prisma.commercialInvoice.update({ where: { id }, data: { status } }).then(async (inv) => {
      await this.audit.log({ userId: actor.id, action: `STATUS:${status}`, entity: 'CommercialInvoice', entityId: id });
      await this.activity.log('CommercialInvoice', id, 'status', `Status changed to ${status}`, actor.id);
      return inv;
    });
  }

  @Post(':id/send')
  @RequirePermissions('commercial.write')
  async send(@Param('id') id: string, @CurrentUser() actor: AuthUser) {
    const inv = await this.prisma.commercialInvoice.findUnique({ where: { id }, include: { buyer: true, lines: true } });
    if (!inv?.buyer?.email) return { status: 'Failed', error: 'Buyer has no email address' };
    const total = linesTotal(inv.lines);
    const html = `<h2>Commercial Invoice ${inv.code}</h2>
      <p>Dear ${inv.buyer.name},</p>
      <p>Please find our commercial invoice (HS ${inv.hsCode}, ${inv.incoterm}, ${inv.currency}).</p>
      <p><b>Total: ${formatMoney(total, inv.currency)}</b></p>
      <p>Kind regards,<br/>Ancient Halo Coffee Export</p>`;
    const res = await this.email.send({
      to: inv.buyer.email,
      subject: `Commercial Invoice ${inv.code} — Ancient Halo Coffee`,
      html,
      template: 'commercial_invoice',
      entity: 'CommercialInvoice',
      entityId: inv.id,
      userId: actor.id,
    });
    if (res.status !== 'Failed') {
      await this.prisma.commercialInvoice.update({ where: { id }, data: { status: 'Sent' } });
      await this.activity.log('CommercialInvoice', id, 'email', `Emailed to ${inv.buyer.email} (${res.status})`, actor.id);
    } else {
      await this.activity.log('CommercialInvoice', id, 'email', `Email failed: ${res.error}`, actor.id);
    }
    return res;
  }
}

// ───────────────────────────── Sent emails history ─────────────────────────────

@Controller('emails')
export class EmailsController {
  constructor(private prisma: PrismaService) {}

  @Get()
  @RequirePermissions('dashboard.read')
  list(@Query('entity') entity?: string, @Query('entityId') entityId?: string) {
    return this.prisma.emailLog.findMany({
      where: { ...(entity ? { entity } : {}), ...(entityId ? { entityId } : {}) },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
  }
}

// ───────────────────────────── Activity feed ─────────────────────────────

@Controller('activity')
export class ActivityController {
  constructor(private activity: ActivityService) {}

  @Get()
  @RequirePermissions('dashboard.read')
  list(@Query('entity') entity: string, @Query('entityId') entityId: string) {
    return this.activity.list(entity, entityId);
  }
}

// ───────────────────────────── Shipments ─────────────────────────────

@Controller('shipments')
export class ShipmentsController {
  constructor(
    private prisma: PrismaService,
    private audit: AuditService,
    private numbering: NumberingService,
    private activity: ActivityService,
    private compliance: ComplianceService,
  ) {}

  @Get()
  @RequirePermissions('shipment.read')
  list() {
    return this.prisma.shipment.findMany({ include: { contract: { include: { buyer: true } }, documents: true }, orderBy: { createdAt: 'desc' }, take: 500 });
  }

  @Get(':id')
  @RequirePermissions('shipment.read')
  async one(@Param('id') id: string) {
    const shipment = await this.prisma.shipment.findUnique({
      where: { id },
      include: {
        contract: { include: { buyer: true, commercial: { include: { lines: true } }, proforma: { include: { lines: true } } } },
        documents: { include: { companyDoc: true, requirement: true }, orderBy: [{ mandatory: 'desc' }, { docType: 'asc' }] },
        events: { orderBy: { createdAt: 'desc' } },
        eudr: { include: { _count: { select: { plotLinks: true } } } },
      },
    });
    if (!shipment) return { error: 'Not found' };

    // Company-level documents the engine says this shipment relies on, without
    // duplicating them per shipment.
    const companyRequired = await this.prisma.complianceRequirement.findMany({
      where: { scope: { in: ['COMPANY', 'SHARED'] }, mandatory: true, effectiveUntil: null },
      orderBy: { name: 'asc' },
    });

    // Match held documents by docType rather than the requirement FK. A company
    // document recorded from the Compliance tab has no requirementId, and
    // matching on the FK would report a document we demonstrably hold as missing.
    const held = await this.prisma.companyDocument.findMany({
      where: { status: { not: 'Revoked' } },
      orderBy: { issuedAt: 'desc' },
    });
    const heldByType = new Map<string, (typeof held)[number]>();
    for (const d of held) {
      if (!heldByType.has(d.docType)) heldByType.set(d.docType, d);
    }

    // Expiry warnings only matter for documents this shipment actually relies on,
    // so compute them from the same required list rather than the whole company set.
    const expiringSoon = [...heldByType.entries()]
      .filter(([docType]) => companyRequired.some((r: any) => r.documentType === docType))
      .map(([, doc]) => doc)
      .filter((d) => d.expiresAt && new Date(d.expiresAt) <= addDays(new Date(), 60));

    const checklist = shipment.documents.filter((d: any) => d.status !== 'NotApplicable');
    const ready = checklist.filter((d: any) => d.status === 'Ready' || d.status === 'Submitted');

    return {
      ...shipment,
      companyDocuments: companyRequired.map((r: any) => ({
        requirementId: r.id,
        documentType: r.documentType,
        name: r.name,
        authority: r.authority,
        legalBasis: r.legalBasis,
        verificationStatus: r.verificationStatus,
        verificationSource: r.verificationSource,
        held: heldByType.get(r.documentType) ?? null,
      })),
      summary: {
        required: checklist.filter((d: any) => d.mandatory).length,
        ready: ready.length,
        total: checklist.length,
        // Split by verification so the UI can separate confirmed from assumed.
        verified: checklist.filter((d: any) => d.verificationStatus === 'VERIFIED').length,
        unverified: checklist.filter((d: any) => d.verificationStatus && d.verificationStatus !== 'VERIFIED').length,
        expiringSoon: checklist.filter((d: any) => d.validUntil && new Date(d.validUntil) <= addDays(new Date(), 30)).length,
      },
      companyGaps: companyRequired
        .filter((r: any) => !heldByType.has(r.documentType))
        .map((r: any) => ({
          requirementId: r.id,
          documentType: r.documentType,
          name: r.name,
          authority: r.authority,
          legalBasis: r.legalBasis,
          verificationStatus: r.verificationStatus,
        })),
      companyExpiring: expiringSoon.map((d) => ({
        id: d.id,
        docType: d.docType,
        title: d.title,
        number: d.number,
        expiresAt: d.expiresAt,
      })),
    };
  }

  @Post()
  @RequirePermissions('shipment.write')
  async create(@Body(new ZodValidationPipe(shipmentSchema)) body: ShipmentInput, @CurrentUser() actor: AuthUser) {
    const code = await this.numbering.next('shipment', body.date ?? new Date());
    const trackingNo = `PAQ-${code.replace(/\D/g, '').slice(-6) || String(Date.now()).slice(-6)}`;
    const contract = body.contractId
      ? await this.prisma.salesContract.findUnique({ where: { id: body.contractId }, include: { buyer: true } })
      : null;
    const s = await this.prisma.shipment.create({
      data: {
        code,
        trackingNo,
        contractId: body.contractId ?? null,
        date: body.date ?? null,
        mode: body.mode,
        port: body.port ?? null,
        billOfLading: body.billOfLading ?? null,
        containerNo: body.containerNo ?? null,
        receiver: body.receiver ?? contract?.buyer?.name ?? null,
        address: body.address ?? contract?.buyer?.country ?? null,
        contact: body.contact ?? contract?.buyer?.phone ?? contract?.buyer?.email ?? null,
        itemDescription: body.itemDescription ?? 'Ethiopian green coffee (export)',
        // Destination drives the compliance checklist. Pre-filled from the
        // buyer but overridable, because customs cares where goods are released
        // rather than where the buyer is registered.
        destinationCountryCode: body.destinationCountryCode ?? null,
        productForm: body.productForm ?? 'Green',
        note: body.note ?? null,
        notes: body.notes ?? null,
        status: 'Preparing',
        trackingStatus: 'Received',
        // The checklist is NOT seeded here. It is derived from the destination
        // country by the compliance engine, so it must be resolved after insert.
        events: { create: { status: 'Received', location: body.port ?? 'Station', note: 'Consignment received and registered.' } },
      },
      include: { documents: true, events: true },
    });
    await this.audit.log({ userId: actor.id, action: 'CREATE', entity: 'Shipment', entityId: s.id });
    await this.activity.log('Shipment', s.id, 'created', `Shipment ${s.code} created (${trackingNo})`, actor.id);

    // Resolve the destination-driven document checklist. A failure here must not
    // lose the shipment, so the error is logged rather than thrown.
    let checklist: unknown = null;
    try {
      checklist = await this.compliance.applyToShipment(s.id, { regenerate: true });
    } catch (e) {
      this.activity.log(
        'Shipment',
        s.id,
        'note',
        `Checklist resolution failed: ${(e as Error).message}. Run POST /shipments/${s.id}/compliance/apply to retry.`,
        actor.id,
      );
    }

    return { ...s, checklist };
  }

  /**
   * Recompute the checklist for the current destination. Safe to call repeatedly.
   */
  @Post(':id/compliance/apply')
  @RequirePermissions('shipment.write')
  async applyCompliance(@Param('id') id: string, @Body('regenerate') regenerate: boolean, @CurrentUser() actor: AuthUser) {
    const result = await this.compliance.applyToShipment(id, { regenerate: !!regenerate });
    await this.activity.log(
      'Shipment',
      id,
      'note',
      `Checklist resolved for ${result.destination ?? 'unspecified destination'}: ${result.created.length} added, ${result.updated.length} refreshed, ${result.retracted.length} no longer required`,
      actor.id,
    );
    return result;
  }

  /** Change destination and re-resolve in one call. */
  @Patch(':id/compliance/destination')
  @RequirePermissions('shipment.write')
  async setDestination(
    @Param('id') id: string,
    @Body() body: { destinationCountryCode?: string | null; productForm?: string | null },
    @CurrentUser() actor: AuthUser,
  ) {
    const shipment = await this.prisma.shipment.update({
      where: { id },
      data: {
        destinationCountryCode: body.destinationCountryCode ?? null,
        productForm: body.productForm ?? 'Green',
      },
    });
    const result = await this.compliance.applyToShipment(id);
    await this.audit.log({
      userId: actor.id,
      action: 'SET_DESTINATION',
      entity: 'Shipment',
      entityId: id,
      after: body,
    });
    await this.activity.log(
      'Shipment',
      id,
      'status',
      `Destination set to ${result.destination ?? 'unspecified'} — ${result.created.length} documents required, ${result.retracted.length} no longer applicable`,
      actor.id,
    );
    return { shipment, ...result };
  }

  /** Link a company-level document to the checklist rows that depend on it. */
  @Post(':id/compliance/link-company-doc')
  @RequirePermissions('shipment.write')
  async linkCompanyDoc(@Param('id') id: string, @Body('companyDocId') companyDocId: string) {
    return this.compliance.linkCompanyDocument(id, companyDocId);
  }

  @Patch(':id/status')
  @RequirePermissions('shipment.write')
  async setStatus(@Param('id') id: string, @Body('status') status: string, @CurrentUser() actor: AuthUser) {
    const s = await this.prisma.shipment.update({ where: { id }, data: { status } });
    await this.activity.log('Shipment', id, 'status', `Document status changed to ${status}`, actor.id);
    return s;
  }

  /** Update the in-transit tracking status and append a timeline event. */
  @Patch(':id/tracking')
  @RequirePermissions('shipment.write')
  async tracking(
    @Param('id') id: string,
    @Body() body: { status: string; note?: string; location?: string },
    @CurrentUser() actor: AuthUser,
  ) {
    const [shipment] = await this.prisma.$transaction([
      this.prisma.shipment.update({
        where: { id },
        data: { trackingStatus: body.status, ...(body.status === 'Delivered' ? { status: 'Delivered' } : {}) },
      }),
      this.prisma.shipmentEvent.create({
        data: { shipmentId: id, status: body.status, note: body.note ?? null, location: body.location ?? null },
      }),
    ]);
    await this.activity.log('Shipment', id, 'status', `Tracking: ${body.status}${body.location ? ` — ${body.location}` : ''}`, actor.id);
    return shipment;
  }

  @Post(':id/events')
  @RequirePermissions('shipment.write')
  async addEvent(@Param('id') id: string, @Body() body: { status: string; note?: string; location?: string }) {
    return this.prisma.shipmentEvent.create({
      data: { shipmentId: id, status: body.status, note: body.note ?? null, location: body.location ?? null },
    });
  }

  @Patch('documents/:docId')
  @RequirePermissions('shipment.write')
  async updateDoc(@Param('docId') docId: string, @Body() body: { status?: string; reference?: string }) {
    const doc = await this.prisma.shipmentDocument.update({ where: { id: docId }, data: body });
    await this.activity.log('Shipment', doc.shipmentId, 'note', `${doc.docType}: ${body.status ?? doc.status}`);
    return doc;
  }
}
