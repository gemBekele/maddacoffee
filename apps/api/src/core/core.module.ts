import { ComplianceController } from './compliance.controller';
import { TraceabilityController } from './traceability.controller';
import { ComplianceService } from './compliance.service';

import { Module } from '@nestjs/common';
import { StationsController } from './stations';
import { SuppliersController } from './suppliers';
import { PurchasesController } from './purchases';
import { ProcessingController } from './processing';
import { InventoryController } from './inventory';
import { DashboardController } from './dashboard';
import {
  BuyersController,
  QuotationsController,
  ProformasController,
  ContractsController,
  CommercialController,
  ShipmentsController,
  EmailsController,
  ActivityController,
} from './sales';
import { PaymentsController, ExpensesController } from './finance';
import { ApprovalsController } from './approvals';
import { ReportsController } from './reports';
import { NumberingService } from '../common/numbering.service';
import { AuditService } from '../common/audit.service';
import { EmailService } from '../common/email.service';
import { ApprovalService } from '../common/approval.service';
import { ActivityService } from '../common/activity.service';

@Module({
  controllers: [
    StationsController,
    SuppliersController,
    PurchasesController,
    ProcessingController,
    InventoryController,
    DashboardController,
    BuyersController,
    QuotationsController,
    ProformasController,
    ContractsController,
    CommercialController,
    ShipmentsController,
    PaymentsController,
    ExpensesController,
    ApprovalsController,
    ReportsController,
    EmailsController,
    ActivityController,
    ComplianceController,
    TraceabilityController,
  ],
  providers: [
    NumberingService,
    AuditService,
    EmailService,
    ApprovalService,
    ActivityService,
    ComplianceService,
  ],
  exports: [
    NumberingService,
    AuditService,
    EmailService,
    ApprovalService,
    ActivityService,
    ComplianceService,
  ],
})
export class CoreModule {}
