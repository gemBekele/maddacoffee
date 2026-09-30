import { Module } from '@nestjs/common';
import { UsersService } from './users.service';
import { UsersController } from './users.controller';
import { AuditService } from '../common/audit.service';

@Module({
  providers: [UsersService, AuditService],
  controllers: [UsersController],
  exports: [UsersService],
})
export class UsersModule {}
