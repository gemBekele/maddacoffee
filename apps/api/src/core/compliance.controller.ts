import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ComplianceService } from './compliance.service';
import { PrismaService } from '../prisma/prisma.service';
import { RequirePermissions, CurrentUser, type AuthUser } from '../common/decorators';
import { AuditService } from '../common/audit.service';
import { ZodValidationPipe } from '../common/zod.pipe';
import {
  companyDocumentSchema,
  complianceRequirementSchema,
  type CompanyDocumentInput,
  type ComplianceRequirementInput,
} from '@madda/shared';

/**
 * Country compliance profiles, requirements, and document templates.
 *
 * Read endpoints are open to any role that can see the dashboard; writes are
 * gated on settings.manage because changing a requirement changes what every
 * future shipment will demand.
 */
@Controller('compliance')
export class ComplianceController {
  constructor(
    private prisma: PrismaService,
    private compliance: ComplianceService,
    private audit: AuditService,
  ) {}

  /** Destination profiles, with requirement counts. */
  @Get('profiles')
  @RequirePermissions('compliance.read')
  async profiles() {
    const rows = await this.prisma.countryComplianceProfile.findMany({
      orderBy: { countryName: 'asc' },
      include: { _count: { select: { requirements: true } } },
    });
    return rows;
  }

  /** Requirements, filterable by country/scope/type/verification. */
  @Get('requirements')
  @RequirePermissions('compliance.read')
  async requirements(
    @Query('country') country?: string,
    @Query('scope') scope?: string,
    @Query('type') type?: string,
    @Query('verification') verification?: string,
  ) {
    return this.prisma.complianceRequirement.findMany({
      where: {
        ...(country ? { countryCode: country } : {}),
        ...(scope ? { scope } : {}),
        ...(type ? { requirementType: type } : {}),
        ...(verification ? { verificationStatus: verification } : {}),
      },
      include: { profile: true },
      orderBy: [{ countryCode: 'asc' }, { mandatory: 'desc' }, { name: 'asc' }],
    });
  }

  /** Live preview: what would a shipment to this destination need? */
  @Get('preview')
  @RequirePermissions('compliance.read')
  preview(@Query('country') country?: string, @Query('form') form?: string) {
    return this.compliance.preview(country, form);
  }

  /** Company-level requirements and whether we hold each document. */
  @Get('company-documents')
  @RequirePermissions('compliance.read')
  async companyDocuments(@Query('status') status?: string) {
    const [docs, reqs] = await Promise.all([
      this.prisma.companyDocument.findMany({
        where: status ? { status } : undefined,
        orderBy: [{ expiresAt: 'asc' }, { docType: 'asc' }],
      }),
      this.prisma.complianceRequirement.findMany({
        where: { scope: { in: ['COMPANY', 'SHARED'] }, effectiveUntil: null },
        orderBy: [{ mandatory: 'desc' }, { name: 'asc' }],
      }),
    ]);

    // Cross-reference: a required company document we have not uploaded.
    const held = new Set(docs.map((d) => d.docType));
    const gaps = reqs
      .filter((r) => r.mandatory && !held.has(r.documentType))
      .map((r) => ({
        requirementId: r.id,
        documentType: r.documentType,
        name: r.name,
        authority: r.authority,
        legalBasis: r.legalBasis,
        verificationStatus: r.verificationStatus,
      }));

    const now = new Date();
    const expiring = docs.filter((d) => d.expiresAt && new Date(d.expiresAt) <= addDays(now, 60));

    return { documents: docs, requirements: reqs, gaps, expiring };
  }

  @Post('company-documents')
  @RequirePermissions('settings.manage')
  async addCompanyDocument(
    @Body(new ZodValidationPipe(companyDocumentSchema)) body: CompanyDocumentInput,
    @CurrentUser() actor: AuthUser,
  ) {
    const doc = await this.prisma.companyDocument.create({ data: body });
    await this.audit.log({ userId: actor.id, action: 'CREATE', entity: 'CompanyDocument', entityId: doc.id, after: body });
    return doc;
  }

  @Patch('company-documents/:id')
  @RequirePermissions('settings.manage')
  async updateCompanyDocument(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(companyDocumentSchema.partial())) body: Partial<CompanyDocumentInput>,
    @CurrentUser() actor: AuthUser,
  ) {
    const before = await this.prisma.companyDocument.findUnique({ where: { id } });
    const doc = await this.prisma.companyDocument.update({
      where: { id },
      data: { ...body, status: body.status ?? 'Valid' },
    });
    await this.audit.log({ userId: actor.id, action: 'UPDATE', entity: 'CompanyDocument', entityId: id, before, after: body });
    return doc;
  }

  @Delete('company-documents/:id')
  @RequirePermissions('settings.manage')
  async deleteCompanyDocument(@Param('id') id: string, @CurrentUser() actor: AuthUser) {
    const before = await this.prisma.companyDocument.findUnique({ where: { id } });
    await this.prisma.companyDocument.delete({ where: { id } });
    await this.audit.log({ userId: actor.id, action: 'DELETE', entity: 'CompanyDocument', entityId: id, before });
    return { ok: true };
  }

  /** Document templates: official blank form vs what we generate. */
  @Get('templates')
  @RequirePermissions('compliance.read')
  templates() {
    return this.prisma.documentTemplate.findMany({
      include: { requirement: { select: { name: true, authority: true, legalBasis: true } } },
      orderBy: [{ documentType: 'asc' }],
    });
  }

  /** Verification health: what is stale, unverified, or unconfirmed. */
  @Get('verification')
  @RequirePermissions('compliance.read')
  async verification() {
    const [requirements, profiles] = await Promise.all([
      this.prisma.complianceRequirement.findMany({ select: { verificationStatus: true, lastVerifiedAt: true } }),
      // Profile verification lives in lastVerifiedAt/verificationSource; there is
      // no per-profile verificationStatus column because a profile with no
      // source is unverified by definition.
      this.prisma.countryComplianceProfile.findMany({
        select: { lastVerifiedAt: true, verificationSource: true, countryCode: true },
      }),
    ]);
    const staleBefore = addDays(new Date(), -180);

    return {
      requirements: {
        total: requirements.length,
        byStatus: requirements.reduce<Record<string, number>>((acc, r) => {
          acc[r.verificationStatus] = (acc[r.verificationStatus] ?? 0) + 1;
          return acc;
        }, {}),
        stale: requirements.filter((r) => !r.lastVerifiedAt || new Date(r.lastVerifiedAt) < staleBefore).length,
      },
      profiles: {
        total: profiles.length,
        // A profile is verified when it carries an official source.
        byStatus: profiles.reduce<Record<string, number>>((acc, p) => {
          const k = p.verificationSource ? 'VERIFIED' : 'UNVERIFIED';
          acc[k] = (acc[k] ?? 0) + 1;
          return acc;
        }, {}),
        stale: profiles.filter((p) => !p.lastVerifiedAt || new Date(p.lastVerifiedAt) < staleBefore).length,
      },
      // Requirements with no official source at all, so someone can go find one.
      unsourced: await this.prisma.complianceRequirement.findMany({
        where: { verificationSource: null },
        select: { id: true, name: true, countryCode: true, authority: true, verificationStatus: true },
      }),
    };
  }

  /** Manual trigger test against a real shipment. */
  @Get('requirements/:id/test')
  @RequirePermissions('compliance.read')
  test(@Param('id') id: string, @Query('shipment') shipmentId?: string) {
    return this.compliance.testTriggers(id, shipmentId);
  }

  @Patch('requirements/:id')
  @RequirePermissions('settings.manage')
  async updateRequirement(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(complianceRequirementSchema.partial())) body: Partial<ComplianceRequirementInput>,
    @CurrentUser() actor: AuthUser,
  ) {
    const before = await this.prisma.complianceRequirement.findUnique({ where: { id } });
    const req = await this.prisma.complianceRequirement.update({ where: { id }, data: body });
    await this.audit.log({ userId: actor.id, action: 'UPDATE', entity: 'ComplianceRequirement', entityId: id, before, after: body });
    return req;
  }

  @Post('requirements')
  @RequirePermissions('settings.manage')
  async createRequirement(
    @Body(new ZodValidationPipe(complianceRequirementSchema)) body: ComplianceRequirementInput,
    @CurrentUser() actor: AuthUser,
  ) {
    const req = await this.prisma.complianceRequirement.create({ data: body });
    await this.audit.log({ userId: actor.id, action: 'CREATE', entity: 'ComplianceRequirement', entityId: req.id, after: body });
    return req;
  }
}

function addDays(from: Date, days: number) {
  const d = new Date(from);
  d.setDate(d.getDate() + days);
  return d;
}
