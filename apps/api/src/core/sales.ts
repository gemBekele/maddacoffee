import { Body, Controller, Get, NotFoundException, Param, Patch, Post, Query } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../common/audit.service';
import { NumberingService } from '../common/numbering.service';
import { EmailService } from '../common/email.service';
import { ActivityService } from '../common/activity.service';
import { ComplianceService } from './compliance.service';
import { PdfService } from '../documents/pdf.service';
import { proformaEmail, commercialInvoiceEmail, testEmail } from '../common/email-templates';
import { kg, dateLong } from '../documents/pdf-core';
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
    private pdf: PdfService,
    private compliance: ComplianceService,
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
    const totalKg = pf.lines.reduce((a: number, l: any) => a + Number(l.quantityKg ?? 0), 0);
    const company = await this.pdf.company();

    // Render the PDF before composing the email so the attachment list in the
    // body reflects what actually goes out.
    let attachments: { filename: string; content: Buffer }[] = [];
    try {
      const rendered = await this.pdf.proformaInvoice(id);
      attachments = [{ filename: rendered.filename, content: rendered.buffer }];
    } catch (e) {
      await this.activity.log(
        'ProformaInvoice',
        id,
        'note',
        `Could not render the proforma PDF: ${(e as Error).message}. Sending without the attachment.`,
        actor.id,
      );
    }

    const tpl = proformaEmail({
      company,
      buyerName: pf.buyer.name,
      code: pf.code,
      date: dateLong(pf.date),
      incoterm: pf.incoterm,
      currency: pf.currency,
      validUntil: pf.validity ? dateLong(pf.validity) : null,
      lines: pf.lines.map((l) => ({
        description: l.description,
        lotId: l.lotId,
        quantity: kg(l.quantityKg),
        unit: formatMoney(Number(l.pricePerKg), pf.currency),
        amount: formatMoney(Number(l.amount), pf.currency),
      })),
      totals: [
        { label: 'Total net weight', value: kg(totalKg) },
        { label: 'TOTAL', value: formatMoney(total, pf.currency) },
      ],
      attachments: attachments.map((a) => a.filename),
    });

    const res = await this.email.send({
      to: pf.buyer.email,
      subject: tpl.subject,
      html: tpl.html,
      text: tpl.text,
      attachments,
      template: 'proforma',
      entity: 'ProformaInvoice',
      entityId: pf.id,
      userId: actor.id,
    });
    if (res.status !== 'Failed') {
      await this.prisma.proformaInvoice.update({ where: { id }, data: { status: 'Sent' } });
      await this.activity.log(
        'ProformaInvoice',
        id,
        'email',
        `Emailed to ${pf.buyer.email} with ${attachments.length} attachment(s) (${res.status})`,
        actor.id,
      );
    } else {
      await this.activity.log('ProformaInvoice', id, 'email', `Email failed: ${res.error}`, actor.id);
    }
    return { ...res, attachments: attachments.map((a) => a.filename) };
  }

  /** Convert a proforma into a commercial invoice (keeps the proforma reference). */
  @Post(':id/convert')
  @RequirePermissions('commercial.write')
  async convert(@Param('id') id: string, @CurrentUser() actor: AuthUser) {
    const pf = await this.prisma.proformaInvoice.findUnique({
      where: { id },
      // The contract link matters: the shipment reaches the invoice's document
      // pack through the contract, so the invoice must carry the contractId.
      include: { lines: true, contract: { select: { id: true, incoterm: true, currency: true } } },
    });
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
        contractId: pf.contract?.id ?? null,
        currency: pf.currency,
        incoterm: pf.contract?.incoterm ?? pf.incoterm,
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

    // The proforma -> commercial conversion is what triggers documentation work,
    // so the export document pack is built here. A failure must not lose the
    // invoice, so it is logged rather than thrown; the pack can be rebuilt from
    // the Commercial tab at any time.
    let pack: { created: string[]; updated: string[]; retracted: string[] } | null = null;
    try {
      pack = await this.compliance.applyToInvoice(inv.id, { regenerate: true });
      await this.activity.log(
        'CommercialInvoice',
        inv.id,
        'note',
        `Document pack prepared: ${pack.created.length} required${
          inv.destinationCountryName ? ` for ${inv.destinationCountryName}` : ' (destination not set)'
        }`,
        actor.id,
      );
    } catch (e) {
      await this.activity.log(
        'CommercialInvoice',
        inv.id,
        'note',
        `Document pack could not be prepared: ${(e as Error).message}. Retry from the commercial invoice.`,
        actor.id,
      );
    }

    return { ...inv, documentPack: pack };
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
    private compliance: ComplianceService,
    private pdf: PdfService,
  ) {}

  @Get()
  @RequirePermissions('commercial.read')
  list() {
    return this.prisma.commercialInvoice.findMany({ include: { buyer: true, lines: true }, orderBy: { date: 'desc' }, take: 500 });
  }

  /**
   * A commercial invoice with its export document pack.
   *
   * The pack belongs to the invoice, so it is returned here rather than fetched
   * separately. Company-level documents the invoice relies on are resolved by
   * docType and reported with whether we actually hold them.
   */
  @Get(':id')
  @RequirePermissions('commercial.read')
  async one(@Param('id') id: string) {
    const invoice = await this.prisma.commercialInvoice.findUnique({
      where: { id },
      include: {
        buyer: true,
        lines: true,
        proforma: true,
        contract: { include: { shipment: true } },
        documents: {
          include: { companyDoc: true, requirement: true },
          orderBy: [{ mandatory: 'desc' }, { docType: 'asc' }],
        },
      },
    });
    if (!invoice) throw new NotFoundException('Commercial invoice not found');

    const companyRequired = await this.prisma.complianceRequirement.findMany({
      where: { scope: { in: ['COMPANY', 'SHARED'] }, mandatory: true, effectiveUntil: null },
      orderBy: { name: 'asc' },
    });
    const held = await this.prisma.companyDocument.findMany({
      where: { status: { not: 'Revoked' } },
      orderBy: { issuedAt: 'desc' },
    });
    const heldByType = new Map<string, (typeof held)[number]>();
    for (const d of held) if (!heldByType.has(d.docType)) heldByType.set(d.docType, d);

    const checklist = invoice.documents.filter((d) => d.status !== 'NotApplicable');
    const ready = checklist.filter((d) => d.status === 'Ready' || d.status === 'Submitted');

    return {
      ...invoice,
      companyDocuments: companyRequired.map((r) => ({
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
        required: checklist.filter((d) => d.mandatory).length,
        ready: ready.length,
        total: checklist.length,
        verified: checklist.filter((d) => d.verificationStatus === 'VERIFIED').length,
        unverified: checklist.filter((d) => d.verificationStatus && d.verificationStatus !== 'VERIFIED').length,
        expiringSoon: checklist.filter((d) => d.validUntil && new Date(d.validUntil) <= addDays(new Date(), 30)).length,
      },
      companyGaps: companyRequired
        .filter((r) => !heldByType.has(r.documentType))
        .map((r) => ({
          requirementId: r.id,
          documentType: r.documentType,
          name: r.name,
          authority: r.authority,
          legalBasis: r.legalBasis,
          verificationStatus: r.verificationStatus,
        })),
    };
  }

  /** Rebuild the document pack. Safe to call repeatedly. */
  @Post(':id/compliance/apply')
  @RequirePermissions('commercial.write')
  async applyCompliance(@Param('id') id: string, @Body('regenerate') regenerate: boolean, @CurrentUser() actor: AuthUser) {
    const result = await this.compliance.applyToInvoice(id, { regenerate: !!regenerate });
    await this.activity.log(
      'CommercialInvoice',
      id,
      'note',
      `Document pack resolved for ${result.destination ?? 'unspecified destination'}: ${result.created.length} added, ${result.updated.length} refreshed, ${result.retracted.length} no longer required`,
      actor.id,
    );
    return result;
  }

  /** Change the destination and rebuild the pack in one call. */
  @Patch(':id/compliance/destination')
  @RequirePermissions('commercial.write')
  async setDestination(
    @Param('id') id: string,
    @Body() body: { destinationCountryCode?: string | null; productForm?: string | null },
    @CurrentUser() actor: AuthUser,
  ) {
    const invoice = await this.prisma.commercialInvoice.update({
      where: { id },
      data: {
        destinationCountryCode: body.destinationCountryCode ?? null,
        productForm: body.productForm ?? 'Green',
      },
    });
    const result = await this.compliance.applyToInvoice(id);
    await this.audit.log({ userId: actor.id, action: 'SET_DESTINATION', entity: 'CommercialInvoice', entityId: id, after: body });
    await this.activity.log(
      'CommercialInvoice',
      id,
      'status',
      `Destination set to ${result.destination ?? 'unspecified'} — ${result.created.length} documents required, ${result.retracted.length} no longer applicable`,
      actor.id,
    );
    return { invoice, ...result };
  }

  /** Link a company-level document to the pack rows that depend on it. */
  @Post(':id/compliance/link-company-doc')
  @RequirePermissions('commercial.write')
  async linkCompanyDoc(@Param('id') id: string, @Body('companyDocId') companyDocId: string) {
    return this.compliance.linkCompanyDocument(id, companyDocId);
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
    const inv = await this.prisma.commercialInvoice.findUnique({
      where: { id },
      include: { buyer: true, lines: true, proforma: { include: { lines: true } } },
    });
    if (!inv?.buyer?.email) return { status: 'Failed', error: 'Buyer has no email address' };

    const lines = inv.lines.length ? inv.lines : (inv.proforma?.lines ?? []);
    const total = lines.reduce((a: number, l: any) => a + Number(l.amount ?? 0), 0);
    const totalKg = lines.reduce((a: number, l: any) => a + Number(l.quantityKg ?? 0), 0);
    const company = await this.pdf.company();

    // The whole applicable pack goes out with the invoice. A renderer failure
    // drops that one document rather than blocking the send, and is recorded.
    let attachments: { filename: string; content: Buffer }[] = [];
    try {
      const pack = await this.pdf.packForInvoice(id);
      attachments = pack.map((d) => ({ filename: d.filename, content: d.buffer }));
    } catch (e) {
      await this.activity.log(
        'CommercialInvoice',
        id,
        'note',
        `Could not render the document pack: ${(e as Error).message}. Sending without attachments.`,
        actor.id,
      );
    }

    const tpl = commercialInvoiceEmail({
      company,
      buyerName: inv.buyer.name,
      code: inv.code,
      date: dateLong(inv.date),
      incoterm: inv.incoterm,
      currency: inv.currency,
      hsCode: inv.hsCode,
      destination: inv.destinationCountryName ?? inv.buyer.country,
      lines: lines.map((l: any) => ({
        description: l.description,
        lotId: l.lotId,
        quantity: kg(l.quantityKg),
        unit: formatMoney(Number(l.pricePerKg), inv.currency),
        amount: formatMoney(Number(l.amount), inv.currency),
      })),
      totals: [
        { label: 'Total net weight', value: kg(totalKg) },
        { label: 'TOTAL', value: formatMoney(total, inv.currency) },
      ],
      attachments: attachments.map((a) => a.filename),
    });

    const res = await this.email.send({
      to: inv.buyer.email,
      subject: tpl.subject,
      html: tpl.html,
      text: tpl.text,
      attachments,
      template: 'commercial_invoice',
      entity: 'CommercialInvoice',
      entityId: inv.id,
      userId: actor.id,
    });
    if (res.status !== 'Failed') {
      await this.prisma.commercialInvoice.update({ where: { id }, data: { status: 'Sent' } });
      await this.activity.log(
        'CommercialInvoice',
        id,
        'email',
        `Emailed to ${inv.buyer.email} with ${attachments.length} attachment(s) (${res.status})`,
        actor.id,
      );
    } else {
      await this.activity.log('CommercialInvoice', id, 'email', `Email failed: ${res.error}`, actor.id);
    }
    return { ...res, attachments: attachments.map((a) => a.filename) };
  }
}

// ───────────────────────────── Sent emails history ─────────────────────────────

@Controller('emails')
export class EmailsController {
  constructor(
    private prisma: PrismaService,
    private email: EmailService,
    private pdf: PdfService,
  ) {}

  @Get()
  @RequirePermissions('dashboard.read')
  list(@Query('entity') entity?: string, @Query('entityId') entityId?: string) {
    return this.prisma.emailLog.findMany({
      where: { ...(entity ? { entity } : {}), ...(entityId ? { entityId } : {}) },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
  }

  /** Which transport is live, and from which address. No credentials returned. */
  @Get('status')
  @RequirePermissions('dashboard.read')
  status() {
    return this.email.status();
  }

  /**
   * Send a real message through the configured transport.
   *
   * Exists so a misconfigured sender or an unverified domain is caught here
   * rather than on a buyer-facing invoice.
   */
  @Post('test')
  @RequirePermissions('settings.manage')
  async test(@Body('to') to: string, @CurrentUser() actor: AuthUser) {
    if (!to || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(to)) {
      return { status: 'Failed', error: 'A valid destination address is required' };
    }
    const company = await this.pdf.company();
    const transport = this.email.status();
    const tpl = testEmail({
      company,
      transport: transport.provider,
      from: transport.from ?? '(unset)',
    });

    // Render a real invoice PDF as the attachment when one exists, so the test
    // also proves the attachment pipeline rather than only the transport.
    let attachments: { filename: string; content: Buffer }[] = [];
    let attachedSample: string | null = null;
    const sample = await this.prisma.commercialInvoice.findFirst({ orderBy: { date: 'desc' } });
    if (sample) {
      try {
        const rendered = await this.pdf.commercialInvoice(sample.id);
        attachments = [{ filename: rendered.filename, content: rendered.buffer }];
        attachedSample = sample.code;
      } catch {
        // A test must not fail because one document cannot render.
      }
    }

    const result = await this.email.send({
      to,
      subject: tpl.subject,
      html: tpl.html,
      text: tpl.text,
      attachments,
      template: 'test',
      entity: 'System',
      entityId: actor.id,
      userId: actor.id,
    });
    return {
      ...result,
      transport,
      attachments: attachments.map((a) => a.filename),
      sampleInvoice: attachedSample,
    };
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
  async list() {
    const rows = await this.prisma.shipment.findMany({
      include: {
        contract: { include: { buyer: true, commercial: { include: { documents: true } } } },
      },
      orderBy: { createdAt: 'desc' },
      take: 500,
    });
    // The document pack belongs to the invoice, so surface it under the shipment
    // as a read-through rather than storing a second copy.
    return rows.map((s) => ({
      ...s,
      commercialInvoice: s.contract?.commercial ?? null,
      documents: s.contract?.commercial?.documents ?? [],
    }));
  }

  @Get(':id')
  @RequirePermissions('shipment.read')
  async one(@Param('id') id: string) {
    const shipment = await this.prisma.shipment.findUnique({
      where: { id },
      include: {
        contract: {
          include: {
            buyer: true,
            commercial: {
              include: {
                lines: true,
                buyer: true,
                documents: {
                  include: { companyDoc: true, requirement: true },
                  orderBy: [{ mandatory: 'desc' }, { docType: 'asc' }],
                },
              },
            },
            proforma: { include: { lines: true } },
          },
        },
        events: { orderBy: { createdAt: 'desc' } },
        eudr: { include: { _count: { select: { plotLinks: true } } } },
      },
    });
    if (!shipment) return { error: 'Not found' };

    const invoice = shipment.contract?.commercial ?? null;
    const companyRequired = await this.prisma.complianceRequirement.findMany({
      where: { scope: { in: ['COMPANY', 'SHARED'] }, mandatory: true, effectiveUntil: null },
      orderBy: { name: 'asc' },
    });
    const held = await this.prisma.companyDocument.findMany({
      where: { status: { not: 'Revoked' } },
      orderBy: { issuedAt: 'desc' },
    });
    const heldByType = new Map<string, (typeof held)[number]>();
    for (const d of held) if (!heldByType.has(d.docType)) heldByType.set(d.docType, d);

    const expiringSoon = [...heldByType.entries()]
      .filter(([docType]) => companyRequired.some((r) => r.documentType === docType))
      .map(([, doc]) => doc)
      .filter((d) => d.expiresAt && new Date(d.expiresAt) <= addDays(new Date(), 60));

    const checklist = (invoice?.documents ?? []).filter((d) => d.status !== 'NotApplicable');
    const ready = checklist.filter((d) => d.status === 'Ready' || d.status === 'Submitted');

    return {
      ...shipment,
      // What the UI reads for the document pack and the destination.
      commercialInvoice: invoice,
      documents: invoice?.documents ?? [],
      destinationCountryCode: invoice?.destinationCountryCode ?? null,
      destinationCountryName: invoice?.destinationCountryName ?? null,
      destinationMarket: invoice?.destinationMarket ?? null,
      productForm: invoice?.productForm ?? null,
      companyDocuments: companyRequired.map((r) => ({
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
        required: checklist.filter((d) => d.mandatory).length,
        ready: ready.length,
        total: checklist.length,
        verified: checklist.filter((d) => d.verificationStatus === 'VERIFIED').length,
        unverified: checklist.filter((d) => d.verificationStatus && d.verificationStatus !== 'VERIFIED').length,
        expiringSoon: checklist.filter((d) => d.validUntil && new Date(d.validUntil) <= addDays(new Date(), 30)).length,
      },
      companyGaps: companyRequired
        .filter((r) => !heldByType.has(r.documentType))
        .map((r) => ({
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
      ? await this.prisma.salesContract.findUnique({
          where: { id: body.contractId },
          include: { buyer: true, commercial: true },
        })
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
        note: body.note ?? null,
        notes: body.notes ?? null,
        status: 'Preparing',
        trackingStatus: 'Received',
        // No document rows are created here. The pack belongs to the commercial
        // invoice. Attaching the shipment only refreshes the invoice's pack so
        // the logistics link and transport mode are picked up.
        events: { create: { status: 'Received', location: body.port ?? 'Station', note: 'Consignment received and registered.' } },
      },
      include: { events: true },
    });
    await this.audit.log({ userId: actor.id, action: 'CREATE', entity: 'Shipment', entityId: s.id });
    await this.activity.log('Shipment', s.id, 'created', `Shipment ${s.code} created (${trackingNo})`, actor.id);

    if (contract?.commercial?.id) {
      try {
        await this.compliance.applyToInvoice(contract.commercial.id);
      } catch (e) {
        this.activity.log(
          'Shipment',
          s.id,
          'note',
          `Document pack refresh failed: ${(e as Error).message}`,
          actor.id,
        );
      }
    } else {
      this.activity.log(
        'Shipment',
        s.id,
        'note',
        'Shipment created without a commercial invoice. Export documents are prepared once the proforma is converted.',
        actor.id,
      );
    }

    return s;
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
    const doc = await this.prisma.exportDocument.update({ where: { id: docId }, data: body });
    // Log against the invoice that owns the pack, since that is where the work
    // is recorded when no shipment exists yet.
    await this.activity.log(
      'CommercialInvoice',
      doc.commercialInvoiceId,
      'note',
      `${doc.docType}: ${body.status ?? doc.status}`,
    );
    return doc;
  }
}
