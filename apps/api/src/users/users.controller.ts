import { Body, Controller, Get, Param, Patch, Post } from '@nestjs/common';
import { UsersService } from './users.service';
import { RequirePermissions, CurrentUser, type AuthUser } from '../common/decorators';
import { ZodValidationPipe } from '../common/zod.pipe';
import { createUserSchema, type CreateUserInput } from '@madda/shared';

@Controller('users')
export class UsersController {
  constructor(private users: UsersService) {}

  @Get()
  @RequirePermissions('users.manage')
  list() {
    return this.users.list();
  }

  @Get('roles')
  @RequirePermissions('users.manage')
  roles() {
    return this.users.roles();
  }

  @Post()
  @RequirePermissions('users.manage')
  create(@Body(new ZodValidationPipe(createUserSchema)) body: CreateUserInput, @CurrentUser() actor: AuthUser) {
    return this.users.create(body, actor.id);
  }

  @Patch(':id')
  @RequirePermissions('users.manage')
  update(@Param('id') id: string, @Body() body: any, @CurrentUser() actor: AuthUser) {
    return this.users.update(id, body, actor.id);
  }
}
