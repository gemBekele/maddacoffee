import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../common/audit.service';
import { NumberingService } from '../common/numbering.service';
import { ApprovalService } from '../common/approval.service';
import { RequirePermissions, CurrentUser, type AuthUser } from '../common/decorators';
import { ZodValidationPipe } from '../common/zod.pipe';
import { paymentSchema, expenseSchema, type PaymentInput, type ExpenseInput } from '@madda/shared';

@Controller('payments')
export class PaymentsController {
  constructor(
    private prisma: PrismaService,
    private audit: AuditService,
    private numbering: NumberingService,
    private approval: ApprovalService,
  ) {}

  @Get()
  @RequirePermissions('payment.read')
  list(@Query('stationId') stationId?: string) {
    return this.prisma.payment.findMany({
      where: stationId ? { stationId } : {},
      include: { station: true },
      orderBy: { date: 'desc' },
      take: 500,
    });
  }

  @Post()
  @RequirePermissions('payment.write')
  async create(@Body(new ZodValidationPipe(paymentSchema)) body: PaymentInput, @CurrentUser() actor: AuthUser) {
    const code = await this.numbering.next('payment', body.date);
    const needs = await this.approval.needed('payment', Number(body.amount));
    const payment = await this.prisma.payment.create({
      data: {
        code,
        date: body.date,
        stationId: body.stationId ?? null,
        payee: body.payee,
        type: body.type,
        referenceId: body.referenceId ?? null,
        amount: body.amount,
        currency: body.currency,
        method: body.method,
        status: needs ? 'Pending' : body.status,
        notes: body.notes ?? null,
        createdById: actor.id,
      },
    });
    if (needs) {
      await this.approval.request({
        entity: 'Payment',
        entityId: payment.id,
        code,
        summary: `${body.type} to ${body.payee}`,
        amount: Number(body.amount),
        currency: body.currency,
        requestedById: actor.id,
      });
    }
    await this.audit.log({ userId: actor.id, action: 'CREATE', entity: 'Payment', entityId: payment.id });
    return { ...payment, approvalRequired: needs };
  }

  @Patch(':id/status')
  @RequirePermissions('payment.write')
  setStatus(@Param('id') id: string, @Body('status') status: string) {
    return this.prisma.payment.update({ where: { id }, data: { status } });
  }
}

@Controller('expenses')
export class ExpensesController {
  constructor(
    private prisma: PrismaService,
    private audit: AuditService,
    private numbering: NumberingService,
    private approval: ApprovalService,
  ) {}

  @Get()
  @RequirePermissions('expense.read')
  list(@Query('stationId') stationId?: string) {
    return this.prisma.expense.findMany({
      where: stationId ? { stationId } : {},
      include: { station: true },
      orderBy: { date: 'desc' },
      take: 500,
    });
  }

  @Post()
  @RequirePermissions('expense.write')
  async create(@Body(new ZodValidationPipe(expenseSchema)) body: ExpenseInput, @CurrentUser() actor: AuthUser) {
    const code = await this.numbering.next('expense', body.date);
    const needs = await this.approval.needed('expense', Number(body.amount));
    const expense = await this.prisma.expense.create({
      data: {
        code,
        date: body.date,
        stationId: body.stationId,
        category: body.category,
        description: body.description,
        amount: body.amount,
        currency: body.currency,
        paymentStatus: needs ? 'Pending' : body.paymentStatus,
        notes: body.notes ?? null,
        createdById: actor.id,
      },
    });
    if (needs) {
      await this.approval.request({
        entity: 'Expense',
        entityId: expense.id,
        code,
        summary: `${body.category}: ${body.description}`,
        amount: Number(body.amount),
        currency: body.currency,
        requestedById: actor.id,
      });
    }
    await this.audit.log({ userId: actor.id, action: 'CREATE', entity: 'Expense', entityId: expense.id });
    return { ...expense, approvalRequired: needs };
  }

  @Patch(':id/status')
  @RequirePermissions('expense.write')
  setStatus(@Param('id') id: string, @Body('status') status: string) {
    return this.prisma.expense.update({ where: { id }, data: { paymentStatus: status } });
  }
}
