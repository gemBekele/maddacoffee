import { Body, Controller, Get, NotFoundException, Param, Patch, Post, Query } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../common/audit.service';
import { NumberingService } from '../common/numbering.service';
import { ActivityService } from '../common/activity.service';
import { RequirePermissions, CurrentUser, type AuthUser } from '../common/decorators';
import { ZodValidationPipe } from '../common/zod.pipe';
import {
  employeeSchema,
  payrollRunSchema,
  computePayslip,
  totalPayroll,
  defaultPensionEligible,
  ET_INCOME_TAX_BANDS as ET_BANDS,
  type EmployeeInput,
  type PayrollRunInput,
} from '@madda/shared';

// ───────────────────────────── Employees ─────────────────────────────

@Controller('employees')
export class EmployeesController {
  constructor(
    private prisma: PrismaService,
    private audit: AuditService,
    private numbering: NumberingService,
  ) {}

  @Get()
  @RequirePermissions('employee.read')
  list(@Query('status') status?: string, @Query('type') type?: string) {
    return this.prisma.employee.findMany({
      where: {
        ...(status ? { status } : {}),
        ...(type ? { employmentType: type } : {}),
      },
      include: { station: { select: { id: true, name: true, code: true } } },
      orderBy: [{ status: 'asc' }, { name: 'asc' }],
    });
  }

  @Get('summary')
  @RequirePermissions('employee.read')
  async summary() {
    const employees = await this.prisma.employee.findMany({
      where: { status: { not: 'Terminated' } },
      select: { employmentType: true, basicSalary: true, pensionEligible: true, status: true },
    });
    const byType = (t: string) => employees.filter((e) => e.employmentType === t);
    const monthlyBasic = employees.reduce((a, e) => a + Number(e.basicSalary), 0);
    const pensionable = employees.filter((e) => e.pensionEligible);
    const pensionBase = pensionable.reduce((a, e) => a + Number(e.basicSalary), 0);
    return {
      total: employees.length,
      permanent: byType('PERMANENT').length,
      contract: byType('CONTRACT').length,
      onLeave: employees.filter((e) => e.status === 'OnLeave').length,
      monthlyBasic,
      // The employer's own contribution, which is a real monthly cost on top of
      // the salary bill.
      monthlyEmployerPension: pensionBase * 0.11,
      monthlyEmployeePension: pensionBase * 0.07,
      pensionable: pensionable.length,
    };
  }

  @Get(':id')
  @RequirePermissions('employee.read')
  async one(@Param('id') id: string) {
    const employee = await this.prisma.employee.findUnique({
      where: { id },
      include: { station: true, lines: { orderBy: { run: { date: 'desc' } }, take: 12, include: { run: true } } },
    });
    if (!employee) throw new NotFoundException('Employee not found');
    return employee;
  }

  @Post()
  @RequirePermissions('employee.write')
  async create(@Body(new ZodValidationPipe(employeeSchema)) body: EmployeeInput, @CurrentUser() actor: AuthUser) {
    const code = body.code || (await this.numbering.next('employee', new Date()));
    const employee = await this.prisma.employee.create({
      data: {
        ...body,
        code,
        // Contract staff are normally outside the private-sector pension
        // scheme, so the default follows the engagement unless overridden.
        pensionEligible: body.pensionEligible ?? defaultPensionEligible(body.employmentType),
      },
    });
    await this.audit.log({ userId: actor.id, action: 'CREATE', entity: 'Employee', entityId: employee.id, after: body });
    return employee;
  }

  @Patch(':id')
  @RequirePermissions('employee.write')
  async update(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(employeeSchema.partial())) body: Partial<EmployeeInput>,
    @CurrentUser() actor: AuthUser,
  ) {
    const before = await this.prisma.employee.findUnique({ where: { id } });
    if (!before) throw new NotFoundException('Employee not found');
    const employee = await this.prisma.employee.update({ where: { id }, data: body });
    await this.audit.log({ userId: actor.id, action: 'UPDATE', entity: 'Employee', entityId: id, before, after: body });
    return employee;
  }

  @Patch(':id/status')
  @RequirePermissions('employee.write')
  async setStatus(@Param('id') id: string, @Body('status') status: string, @CurrentUser() actor: AuthUser) {
    const employee = await this.prisma.employee.update({ where: { id }, data: { status } });
    await this.audit.log({ userId: actor.id, action: `STATUS:${status}`, entity: 'Employee', entityId: id });
    return employee;
  }
}

// ───────────────────────────── Payroll ─────────────────────────────

@Controller('payroll')
export class PayrollController {
  constructor(
    private prisma: PrismaService,
    private audit: AuditService,
    private numbering: NumberingService,
    private activity: ActivityService,
  ) {}

  @Get('runs')
  @RequirePermissions('payroll.read')
  list() {
    return this.prisma.payrollRun.findMany({
      orderBy: [{ periodYear: 'desc' }, { periodMonth: 'desc' }],
      take: 60,
    });
  }

  @Get('runs/:id')
  @RequirePermissions('payroll.read')
  async one(@Param('id') id: string) {
    const run = await this.prisma.payrollRun.findUnique({
      where: { id },
      include: { lines: { orderBy: { employeeName: 'asc' } } },
    });
    if (!run) throw new NotFoundException('Payroll run not found');
    return run;
  }

  /**
   * Build a payroll run for a month.
   *
   * Lines are computed from the employees who were active in that period and
   * then snapshotted, so approving the run freezes the figures. Rebuilding a
   * Draft replaces its lines; rebuilding an Approved or Paid run is refused,
   * because those are the numbers that were paid.
   */
  @Post('runs')
  @RequirePermissions('payroll.write')
  async create(@Body(new ZodValidationPipe(payrollRunSchema)) body: PayrollRunInput, @CurrentUser() actor: AuthUser) {
    const existing = await this.prisma.payrollRun.findUnique({
      where: { periodYear_periodMonth: { periodYear: body.periodYear, periodMonth: body.periodMonth } },
    });
    if (existing && existing.status !== 'Draft') {
      return {
        error: `A payroll run for ${body.periodMonth}/${body.periodYear} is already ${existing.status} and cannot be rebuilt.`,
      };
    }

    const periodStart = new Date(Date.UTC(body.periodYear, body.periodMonth - 1, 1));
    const periodEnd = new Date(Date.UTC(body.periodYear, body.periodMonth, 0, 23, 59, 59));

    // Someone hired during the month is paid; someone terminated before the
    // month began is not.
    const employees = await this.prisma.employee.findMany({
      where: {
        hireDate: { lte: periodEnd },
        OR: [{ endDate: null }, { endDate: { gte: periodStart } }],
        status: { not: 'Terminated' },
      },
      orderBy: { name: 'asc' },
    });

    const lines = employees.map((e) => {
      const b = computePayslip({
        basicSalary: Number(e.basicSalary),
        transportAllowance: Number(e.transportAllowance),
        housingAllowance: Number(e.housingAllowance),
        otherAllowance: Number(e.otherAllowance),
        pensionEligible: e.pensionEligible,
      });
      return {
        employeeId: e.id,
        employeeCode: e.code,
        employeeName: e.name,
        employmentType: e.employmentType,
        position: e.position,
        pensionEligible: e.pensionEligible,
        basicSalary: b.basicSalary,
        allowances: b.allowances,
        overtime: b.overtime,
        grossPay: b.grossPay,
        taxableIncome: b.taxableIncome,
        incomeTax: b.incomeTax,
        employeePension: b.employeePension,
        otherDeductions: b.otherDeductions,
        netPay: b.netPay,
        employerPension: b.employerPension,
        employerCost: b.employerCost,
      };
    });

    const totals = totalPayroll(
      employees.map((e) =>
        computePayslip({
          basicSalary: Number(e.basicSalary),
          transportAllowance: Number(e.transportAllowance),
          housingAllowance: Number(e.housingAllowance),
          otherAllowance: Number(e.otherAllowance),
          pensionEligible: e.pensionEligible,
        }),
      ),
    );

    const code = existing?.code ?? (await this.numbering.next('payroll', periodStart));

    const run = await this.prisma.$transaction(async (tx) => {
      if (existing) {
        await tx.payrollLine.deleteMany({ where: { runId: existing.id } });
      }
      return tx.payrollRun.upsert({
        where: { periodYear_periodMonth: { periodYear: body.periodYear, periodMonth: body.periodMonth } },
        create: {
          code,
          periodYear: body.periodYear,
          periodMonth: body.periodMonth,
          date: body.date ?? new Date(),
          status: 'Draft',
          notes: body.notes ?? null,
          createdById: actor.id,
          ...totals,
          lines: { create: lines },
        },
        update: {
          date: body.date ?? new Date(),
          notes: body.notes ?? null,
          status: 'Draft',
          ...totals,
          lines: { create: lines },
        },
      });
    });

    await this.audit.log({ userId: actor.id, action: 'CREATE', entity: 'PayrollRun', entityId: run.id, after: { period: body } });
    await this.activity.log(
      'PayrollRun',
      run.id,
      'created',
      `Payroll ${run.code} built for ${body.periodMonth}/${body.periodYear}: ${totals.employeeCount} employees, net ${totals.totalNet}`,
      actor.id,
    );
    return run;
  }

  @Patch('runs/:id/status')
  @RequirePermissions('payroll.write')
  async setStatus(@Param('id') id: string, @Body('status') status: string, @CurrentUser() actor: AuthUser) {
    const run = await this.prisma.payrollRun.findUnique({ where: { id } });
    if (!run) throw new NotFoundException('Payroll run not found');
    if (status === 'Paid' && run.status !== 'Approved') {
      return { error: 'A payroll run must be approved before it can be marked paid.' };
    }
    const updated = await this.prisma.payrollRun.update({
      where: { id },
      data: {
        status,
        approvedById: status === 'Approved' ? actor.id : run.approvedById,
        approvedAt: status === 'Approved' ? new Date() : run.approvedAt,
        paidAt: status === 'Paid' ? new Date() : run.paidAt,
      },
    });
    await this.audit.log({ userId: actor.id, action: `STATUS:${status}`, entity: 'PayrollRun', entityId: id });
    await this.activity.log('PayrollRun', id, 'status', `Payroll ${run.code} marked ${status}`, actor.id);
    return updated;
  }

  @Patch('lines/:id')
  @RequirePermissions('payroll.write')
  async updateLine(
    @Param('id') id: string,
    @Body() body: { overtime?: number; otherDeductions?: number; notes?: string },
    @CurrentUser() actor: AuthUser,
  ) {
    const line = await this.prisma.payrollLine.findUnique({ where: { id }, include: { run: true } });
    if (!line) throw new NotFoundException('Payroll line not found');
    if (line.run.status !== 'Draft') {
      return { error: `This payroll run is ${line.run.status}. Only a Draft run can be edited.` };
    }

    // Recompute from the stored salary plus the adjusted inputs, so the
    // arithmetic stays consistent rather than being patched field by field.
    const b = computePayslip({
      basicSalary: Number(line.basicSalary),
      otherAllowance: Number(line.allowances),
      overtime: body.overtime ?? Number(line.overtime),
      otherDeductions: body.otherDeductions ?? Number(line.otherDeductions),
      pensionEligible: line.pensionEligible,
    });

    const updated = await this.prisma.payrollLine.update({
      where: { id },
      data: {
        overtime: b.overtime,
        grossPay: b.grossPay,
        taxableIncome: b.taxableIncome,
        incomeTax: b.incomeTax,
        employeePension: b.employeePension,
        otherDeductions: b.otherDeductions,
        netPay: b.netPay,
        employerPension: b.employerPension,
        employerCost: b.employerCost,
        notes: body.notes ?? line.notes,
      },
    });

    await this.recalcRun(line.runId);
    await this.audit.log({ userId: actor.id, action: 'UPDATE', entity: 'PayrollLine', entityId: id, after: body });
    return updated;
  }

  /** Re-derive the run totals from its lines after an edit. */
  private async recalcRun(runId: string) {
    const lines = await this.prisma.payrollLine.findMany({ where: { runId } });
    const n = (v: unknown) => Number(v ?? 0);
    const totals = {
      employeeCount: lines.length,
      totalGross: lines.reduce((a, l) => a + n(l.grossPay), 0),
      totalIncomeTax: lines.reduce((a, l) => a + n(l.incomeTax), 0),
      totalEmployeePension: lines.reduce((a, l) => a + n(l.employeePension), 0),
      totalOtherDeductions: lines.reduce((a, l) => a + n(l.otherDeductions), 0),
      totalNet: lines.reduce((a, l) => a + n(l.netPay), 0),
      totalEmployerPension: lines.reduce((a, l) => a + n(l.employerPension), 0),
      totalEmployerCost: lines.reduce((a, l) => a + n(l.employerCost), 0),
    };
    await this.prisma.payrollRun.update({ where: { id: runId }, data: totals });
  }

  /** The band table, so the UI can show how a figure was arrived at. */
  @Get('tax-bands')
  @RequirePermissions('payroll.read')
  taxBands() {
    return {
      country: 'Ethiopia',
      legalBasis:
        'Federal Income Tax Amendment Proclamation No. 1395/2025, effective 1 July 2025',
      pensionLegalBasis:
        'Private Organization Employees Pension Proclamation No. 715/2011 art. 10 (employer 11%, employee 7%)',
      note:
        'Tax is charged on gross taxable income. The employee pension contribution is withheld after tax, not before it.',
      bands: ET_BANDS,
      pension: { employee: 0.07, employer: 0.11 },
    };
  }
}
