import { Module } from '@nestjs/common';
import { ReferenceController } from './reference.controller';
import { AuditService } from '../common/audit.service';

@Module({
  controllers: [ReferenceController],
  providers: [AuditService],
})
export class ReferenceModule {}
