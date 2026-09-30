import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { ApprovalService } from '../common/approval.service';
import { RequirePermissions, CurrentUser, type AuthUser } from '../common/decorators';
import { ZodValidationPipe } from '../common/zod.pipe';
import { approvalDecisionSchema } from '@madda/shared';

@Controller('approvals')
export class ApprovalsController {
  constructor(private approval: ApprovalService) {}

  @Get()
  @RequirePermissions('dashboard.read')
  list(@Query('status') status?: string) {
    return this.approval.list(status);
  }

  @Post(':id/decide')
  @RequirePermissions('payment.approve')
  decide(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(approvalDecisionSchema)) body: { status: 'Approved' | 'Rejected'; note?: string },
    @CurrentUser() actor: AuthUser,
  ) {
    return this.approval.decide(id, body.status, actor.id, body.note ?? undefined);
  }
}
