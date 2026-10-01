import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  resolveRequirements,
  toChecklist,
  addDays,
  addWorkingDays,
  evaluateTriggers,
  defaultHsCode,
  type RequirementLike,
  type TriggerContext,
  type ResolvedRequirement,
} from '@madda/shared';

/**
 * Country compliance resolution.
 *
 * The chain is: CommercialInvoice.destinationCountryCode -> CountryComplianceProfile ->
 * ComplianceRequirement rows matching that country, its market block, or "*" ->
 * product-form and effective-date filters -> triggerConditions -> materialised
 * ShipmentDocument rows.
 *
 * Two invariants this service is responsible for:
 *
 *  1. Nothing unverified is ever presented as a confirmed legal requirement.
 *     Every result carries verificationStatus so the UI can label it.
 *
 *  2. Changing a shipment's destination never deletes document history. Rows
 *     that stop being required are flipped to NotApplicable, because a
 *     Submitted EUDR reference or an issued phytosanitary certificate is a
 *     record that has to survive the five-year retention rule.
 */
@Injectable()
export class ComplianceService {
  private logger = new Logger('Compliance');

  constructor(private prisma: PrismaService) {}

  /** Requirement rows, shaped for the shared resolver. */
  private async allRequirements(): Promise<RequirementLike[]> {
    const rows = await this.prisma.complianceRequirement.findMany({ where: { effectiveUntil: null } });
    return rows.map((r) => ({
      id: r.id,
      name: r.name,
      description: r.description,
      authority: r.authority,
      requirementType: r.requirementType,
      scope: r.scope,
      issuerType: r.issuerType,
      documentType: r.documentType,
      mandatory: r.mandatory,
      conditional: r.conditional,
      countryCode: r.countryCode,
      marketBlock: r.marketBlock,
      triggerConditions: r.triggerConditions,
      requiredData: r.requiredData,
      submissionMethod: r.submissionMethod,
      officialUrl: r.officialUrl,
      legalBasis: r.legalBasis,
      leadTimeDays: r.leadTimeDays,
      validityDays: r.validityDays,
      appliesToImporter: r.appliesToImporter ?? false,
      effectiveFrom: r.effectiveFrom,
      effectiveUntil: r.effectiveUntil,
      verificationStatus: r.verificationStatus,
      verificationSource: r.verificationSource,
      notes: r.notes,
    }));
  }

  /** Resolve the requirements for a destination without touching any shipment. */
  async preview(destinationCountryCode?: string | null, productForm?: string | null) {
    const profiles = await this.prisma.countryComplianceProfile.findMany({
      where: destinationCountryCode ? { countryCode: destinationCountryCode } : undefined,
      orderBy: { countryName: 'asc' },
    });
    const profile = profiles[0] ?? null;
    const requirements = await this.allRequirements();

    // A preview has no shipment, so we cannot evaluate value/lot-dependent
    // triggers. We report them as "needs shipment data" rather than guessing.
    const resolved = resolveRequirements(requirements, {
      destinationCountryCode: profile?.countryCode ?? null,
      marketBlock: profile?.marketBlock ?? null,
      context: { form: productForm ?? 'Green' },
    });

    const universal = resolveRequirements(requirements, {
      destinationCountryCode: null,
      context: { form: productForm ?? 'Green' },
    });

    return {
      destination: profile
        ? {
            countryCode: profile.countryCode,
            countryName: profile.countryName,
            market: profile.market,
            marketBlock: profile.marketBlock,
            verificationStatus: profile.lastVerifiedAt ? 'VERIFIED' : 'UNVERIFIED',
            verificationSource: profile.verificationSource,
            notes: profile.notes,
          }
        : null,
      hsCode: defaultHsCode(productForm ?? 'Green'),
      requirements: resolved.map((x) => this.describe(x)),
      universalOnly: universal
        .filter((u) => !resolved.some((r) => r.requirement.documentType === u.requirement.documentType))
        .map((x) => this.describe(x)),
      companyRequirements: await this.companyChecklist(),
      verifiedCount: resolved.filter((x) => x.requirement.verificationStatus === 'VERIFIED').length,
      unverifiedCount: resolved.filter((x) => x.requirement.verificationStatus !== 'VERIFIED').length,
    };
  }

  private describe(x: ResolvedRequirement) {
    const r = x.requirement;
    return {
      requirementId: r.id,
      name: r.name,
      description: r.description,
      authority: r.authority,
      requirementType: r.requirementType,
      scope: r.scope,
      issuerType: r.issuerType,
      documentType: r.documentType,
      mandatory: r.mandatory,
      conditional: r.conditional,
      countryCode: r.countryCode,
      matchScope: x.matchScope,
      applies: x.applies,
      unmet: x.unmet,
      submissionMethod: r.submissionMethod,
      officialUrl: r.officialUrl,
      legalBasis: r.legalBasis,
      leadTimeDays: r.leadTimeDays,
      validityDays: r.validityDays,
      appliesToImporter: r.appliesToImporter,
      verificationStatus: r.verificationStatus,
      verificationSource: r.verificationSource,
      notes: r.notes,
      // A rule whose triggers need shipment data we do not have yet.
      needsShipmentData: !!(r.triggerConditions as any)?.valueUsdMin ||
        !!(r.triggerConditions as any)?.cupScoreMin ||
        !!(r.triggerConditions as any)?.gradeMin,
    };
  }

  /** Company-level requirements, with whether we hold the document. */
  private async companyChecklist() {
    const reqs = await this.prisma.complianceRequirement.findMany({
      where: { scope: { in: ['COMPANY', 'SHARED'] }, effectiveUntil: null },
      orderBy: { mandatory: 'desc' },
    });
    const held = await this.prisma.companyDocument.findMany({ where: { status: { not: 'Revoked' } } });
    const now = new Date();

    return reqs.map((r) => {
      const doc = held
        .filter((d) => d.docType === r.documentType)
        .sort((a, b) => new Date(b.issuedAt).getTime() - new Date(a.issuedAt).getTime())[0];
      const expired = doc?.expiresAt ? new Date(doc.expiresAt) < now : false;
      return {
        requirementId: r.id,
        name: r.name,
        documentType: r.documentType,
        authority: r.authority,
        description: r.description,
        mandatory: r.mandatory,
        scope: r.scope,
        issuerType: r.issuerType,
        legalBasis: r.legalBasis,
        officialUrl: r.officialUrl,
        verificationStatus: r.verificationStatus,
        verificationSource: r.verificationSource,
        held: !!doc,
        documentId: doc?.id ?? null,
        number: doc?.number ?? null,
        issuedAt: doc?.issuedAt ?? null,
        expiresAt: doc?.expiresAt ?? null,
        expired,
      };
    });
  }

  /**
   * Build the trigger context a real commercial invoice presents.
   *
   * Everything the rules key on is a commercial term of the invoice: the lots on
   * its lines, the Incoterm, the buyer, and the value. Mode is the only
   * shipment-level input, and it is only present once a shipment exists.
   */
  private async buildContext(invoiceId: string): Promise<{ ctx: TriggerContext; valueUsd: number | null }> {
    const invoice = await this.prisma.commercialInvoice.findUnique({
      where: { id: invoiceId },
      include: {
        lines: true,
        buyer: { select: { country: true } },
        contract: { include: { proforma: { include: { lines: true } } } },
      },
    });
    if (!invoice) throw new NotFoundException('Commercial invoice not found');

    // An invoice converted from a proforma may not have its own lines if the
    // conversion predates line copying, so fall back to the proforma's lines.
    const lines = invoice.lines.length ? invoice.lines : (invoice.contract?.proforma?.lines ?? []);
    const lotIds = [...new Set(lines.map((l: any) => l.lotId).filter(Boolean))] as string[];

    const lots = lotIds.length
      ? await this.prisma.lot.findMany({
          where: { lotId: { in: lotIds } },
          select: { coffeeType: true, form: true, process: true, grade: true, organic: true, cuppingScore: true },
        })
      : [];

    const hasPlotData = lotIds.length
      ? (await this.prisma.lotTrace.count({ where: { lotId: { in: lotIds } } })) > 0
      : false;

    const amount = lines.reduce((sum: number, l: any) => sum + Number(l.amount ?? 0), 0);
    const valueUsd = Number.isFinite(amount) && amount > 0 ? amount : null;

    return {
      valueUsd,
      ctx: {
        form: invoice.productForm ?? 'Green',
        coffeeTypes: [...new Set(lots.map((l) => l.coffeeType).filter(Boolean))] as string[],
        processes: [...new Set(lots.map((l) => l.process).filter(Boolean))] as string[],
        organic: lots.some((l) => l.organic),
        incoterm: invoice.incoterm ?? invoice.contract?.incoterm ?? null,
        valueUsd,
        cupScores: lots.map((l) => (l.cuppingScore ? Number(l.cuppingScore) : null)).filter((n): n is number => n !== null),
        grades: lots.map((l) => l.grade).filter(Boolean) as string[],
        buyerCountry: invoice.buyer?.country ?? null,
        mode: null, // set by the caller when a shipment is linked
        hasPlotData,
      },
    };
  }

  /**
   * Recompute the export document pack for a commercial invoice.
   *
   * The invoice owns the pack. Additive only: rows whose documentType is no
   * longer required, or whose triggers stopped firing, become NotApplicable
   * rather than being deleted, because an issued certificate or a submitted DDS
   * reference is a record that has to survive a destination change.
   */
  async applyToInvoice(invoiceId: string, opts: { regenerate?: boolean } = {}) {
    const invoice = await this.prisma.commercialInvoice.findUnique({
      where: { id: invoiceId },
      include: { contract: { include: { shipment: true } } },
    });
    if (!invoice) throw new NotFoundException('Commercial invoice not found');

    // Backfill the market block so we do not need a join on every resolution.
    if (invoice.destinationCountryCode) {
      const profile = await this.prisma.countryComplianceProfile.findFirst({
        where: { countryCode: invoice.destinationCountryCode },
      });
      if (profile) {
        invoice.destinationCountryName = profile.countryName;
        invoice.destinationMarket = profile.market;
      }
    }

    // A shipment, when one exists, only contributes its transport mode to the
    // trigger context. Every other input is a commercial term of the invoice.
    const linkedShipmentId = invoice.contract?.shipment?.id ?? null;
    const { ctx, valueUsd } = await this.buildContext(invoiceId);
    if (invoice.contract?.shipment?.mode) ctx.mode = invoice.contract.shipment.mode;

    const requirements = await this.allRequirements();
    const asOf = invoice.date ?? new Date();

    const resolved = resolveRequirements(requirements, {
      destinationCountryCode: invoice.destinationCountryCode,
      marketBlock: invoice.destinationMarket,
      asOf,
      context: ctx,
    });

    // Company-level requirements are referenced, not materialised per invoice.
    const companyReqs = resolved.filter((x) => ['COMPANY', 'SHARED'].includes(x.requirement.scope));
    const checklist = toChecklist(resolved, 'SHIPMENT');
    const lotDocs = resolved.filter((x) => x.requirement.scope === 'LOT');

    const existing = await this.prisma.exportDocument.findMany({ where: { commercialInvoiceId: invoiceId } });
    const existingByType = new Map(existing.map((d) => [d.docType, d]));
    const wanted = new Set<string>();
    const created: string[] = [];
    const updated: string[] = [];

    for (const item of [...checklist, ...lotDocs]) {
      const r = item.requirement;
      wanted.add(r.documentType);

      const unmet = item.unmet;
      const dueDate = r.leadTimeDays
        ? // Longer than a fortnight is treated as calendar days; shorter lead
          // times behave like working days because they are internal steps.
          r.leadTimeDays > 14
          ? addDays(asOf, r.leadTimeDays)
          : addWorkingDays(asOf, r.leadTimeDays)
        : null;

      const artifactKind =
        r.issuerType === 'ERP_GENERATED'
          ? 'ERP_DOCUMENT'
          : r.issuerType === 'AUTHORITY_ISSUED'
            ? 'APPLICATION_DATA'
            : 'THIRD_PARTY_DOCUMENT';

      const data = {
        mandatory: r.mandatory,
        conditional: r.conditional,
        issuerType: r.issuerType,
        artifactKind,
        authority: r.authority,
        officialUrl: r.officialUrl,
        legalBasis: r.legalBasis,
        submissionMethod: r.submissionMethod,
        verificationStatus: r.verificationStatus,
        verificationSource: r.verificationSource,
        requiredData: (r.requiredData ?? null) as any,
        triggerConditions: (r.triggerConditions ?? null) as any,
        leadTimeDays: r.leadTimeDays,
        countryCode: r.countryCode,
        notes: unmet.length ? `Not triggered: ${unmet.join('; ')}` : r.notes,
      };

      const prior = existingByType.get(r.documentType);
      if (prior) {
        // A row we previously retracted becomes required again when the
        // destination changes back. Re-activate it, but never overwrite a status
        // an operator has already set (Ready/Submitted/InProgress/Rejected).
        const reactivated = prior.status === 'NotApplicable';
        await this.prisma.exportDocument.update({
          where: { id: prior.id },
          data: {
            ...data,
            requirementId: r.id,
            // Keep the logistics link current in case a shipment was attached
            // after the pack was first generated.
            shipmentId: linkedShipmentId,
            ...(reactivated ? { status: 'Pending' } : {}),
            ...(reactivated ? { validUntil: dueDate } : {}),
          },
        });
        updated.push(r.documentType);
      } else {
        await this.prisma.exportDocument.create({
          data: {
            commercialInvoiceId: invoiceId,
            shipmentId: linkedShipmentId,
            docType: r.documentType,
            requirementId: r.id,
            status: 'Pending',
            validUntil: dueDate,
            ...data,
          },
        });
        created.push(r.documentType);
      }
    }

    // Decide deletions BEFORE mutating, otherwise a row already flipped to
    // NotApplicable can never match the filter below.
    //
    // Deletable means: the engine never owned it, nobody worked on it, and there
    // is no artefact. `status` accepts NotApplicable as well as Pending because a
    // row retracted by an earlier run must still be cleanable, otherwise every
    // destination change would leave permanent orphan rows behind.
    const deletable = opts.regenerate
      ? existing.filter(
          (d) =>
            !wanted.has(d.docType) &&
            !d.requirementId &&
            !d.reference &&
            !d.attachmentId &&
            !d.issuedAt &&
            (d.status === 'Pending' || d.status === 'NotApplicable'),
        )
      : [];

    // Retract, never delete, unless explicitly regenerating untouched boilerplate.
    const retracted: string[] = [];
    for (const doc of existing) {
      if (wanted.has(doc.docType)) continue;
      if (deletable.some((d) => d.id === doc.id)) continue;
      await this.prisma.exportDocument.update({
        where: { id: doc.id },
        data: { status: 'NotApplicable', mandatory: false },
      });
      retracted.push(doc.docType);
    }

    if (deletable.length) {
      // Only rows the compliance engine never touched: no requirementId and
      // still Pending. Anything with a reference or an attachment is a record.
      await this.prisma.exportDocument.deleteMany({ where: { id: { in: deletable.map((d) => d.id) } } });
    }

    await this.prisma.commercialInvoice.update({
      where: { id: invoiceId },
      data: {
        destinationCountryName: invoice.destinationCountryName,
        destinationMarket: invoice.destinationMarket,
      },
    });

    this.logger.log(
      `Invoice ${invoice.code}: ${checklist.length + lotDocs.length} documents required for ${invoice.destinationCountryCode ?? 'unspecified destination'} ` +
        `(created ${created.length}, updated ${updated.length}, retracted ${retracted.length}, value $${valueUsd ?? 'n/a'})`,
    );

    return {
      commercialInvoiceId: invoiceId,
      invoiceCode: invoice.code,
      shipmentId: linkedShipmentId,
      destination: invoice.destinationCountryCode,
      valueUsd,
      created,
      updated,
      retracted,
      companyRequired: companyReqs.map((x) => ({
        requirementId: x.requirement.id,
        documentType: x.requirement.documentType,
        name: x.requirement.name,
      })),
      documents: await this.prisma.exportDocument.findMany({
        where: { commercialInvoiceId: invoiceId },
        include: { companyDoc: true, requirement: true },
        orderBy: [{ mandatory: 'desc' }, { docType: 'asc' }],
      }),
    };
  }

  /**
   * Link a company document to the checklist rows that depend on it, keeping a
   * snapshot of the number and expiry at the time of use.
   */
  async linkCompanyDocument(invoiceId: string, companyDocId: string) {
    const doc = await this.prisma.companyDocument.findUnique({ where: { id: companyDocId } });
    if (!doc) throw new NotFoundException('Company document not found');

    await this.prisma.exportDocument.updateMany({
      where: { commercialInvoiceId: invoiceId, docType: doc.docType },
      data: {
        companyDocId: doc.id,
        companyDocSnapshot: {
          docType: doc.docType,
          number: doc.number,
          issuedAt: doc.issuedAt,
          expiresAt: doc.expiresAt,
          issuer: doc.issuer,
          linkedAt: new Date().toISOString(),
        } as any,
      },
    });

    return { ok: true, linked: doc.docType };
  }

  /** Evaluate a stored requirement's triggers on demand, for the UI. */
  async testTriggers(requirementId: string, invoiceId?: string) {
    const r = await this.prisma.complianceRequirement.findUnique({ where: { id: requirementId } });
    if (!r) throw new NotFoundException('Requirement not found');

    let ctx: TriggerContext = {};
    if (invoiceId) ctx = (await this.buildContext(invoiceId)).ctx;
    const res = evaluateTriggers(r.triggerConditions as any, ctx);
    return { requirementId, ...res, context: ctx };
  }
}
