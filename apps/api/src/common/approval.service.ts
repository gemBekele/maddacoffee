import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class ApprovalService {
  constructor(private prisma: PrismaService) {}

  async settings(): Promise<Record<string, any>> {
    const row = await this.prisma.setting.findUnique({ where: { key: 'approvals' } });
    return (row?.value as Record<string, any>) ?? {
      purchase: false,
      expense: false,
      payment: false,
      discount: false,
      threshold: 0,
    };
  }

  /** Returns true if the given item needs approval (enabled AND amount >= threshold). */
  async needed(item: string, amount = 0): Promise<boolean> {
    const s = await this.settings();
    if (!s[item]) return false;
    const threshold = Number(s.threshold ?? 0);
    return amount >= threshold;
  }

  async request(params: {
    entity: string;
    entityId: string;
    code?: string;
    summary?: string;
    amount?: number;
    currency?: string;
    requestedById?: string;
  }) {
    return this.prisma.approval.create({
      data: {
        entity: params.entity,
        entityId: params.entityId,
        code: params.code ?? null,
        summary: params.summary ?? null,
        amount: params.amount ?? null,
        currency: params.currency ?? 'ETB',
        requestedById: params.requestedById ?? null,
        status: 'Pending',
      },
    });
  }

  list(status?: string) {
    return this.prisma.approval.findMany({
      where: status ? { status } : {},
      orderBy: { createdAt: 'desc' },
      take: 500,
    });
  }

  async decide(id: string, status: 'Approved' | 'Rejected', decidedById: string, note?: string) {
    const approval = await this.prisma.approval.update({
      where: { id },
      data: { status, decidedById, note: note ?? null, decidedAt: new Date() },
    });
    // Side-effect: mark the underlying record's payment status accordingly.
    if (approval.entity === 'CherryPurchase' && status === 'Approved') {
      await this.prisma.cherryPurchase.updateMany({
        where: { id: approval.entityId },
        data: { paymentStatus: 'Pending' },
      });
    }
    if (approval.entity === 'Expense' && status === 'Approved') {
      await this.prisma.expense.updateMany({
        where: { id: approval.entityId },
        data: { paymentStatus: 'Pending' },
      });
    }
    return approval;
  }
}
