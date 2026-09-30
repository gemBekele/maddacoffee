import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../common/audit.service';
import { NumberingService } from '../common/numbering.service';
import { RequirePermissions, CurrentUser, type AuthUser } from '../common/decorators';
import { ZodValidationPipe } from '../common/zod.pipe';
import { supplierSchema, type SupplierInput } from '@madda/shared';

@Controller('suppliers')
export class SuppliersController {
  constructor(private prisma: PrismaService, private audit: AuditService, private numbering: NumberingService) {}

  @Get()
  @RequirePermissions('supplier.read')
  list(@Query('search') search?: string, @Query('type') type?: string) {
    return this.prisma.supplier.findMany({
      where: {
        ...(search ? { name: { contains: search, mode: 'insensitive' } } : {}),
        ...(type ? { type } : {}),
      },
      orderBy: { createdAt: 'desc' },
      take: 500,
    });
  }

  @Get(':id')
  @RequirePermissions('supplier.read')
  one(@Param('id') id: string) {
    return this.prisma.supplier.findUnique({
      where: { id },
      include: { purchases: { orderBy: { date: 'desc' }, take: 50 } },
    });
  }

  @Post()
  @RequirePermissions('supplier.write')
  async create(@Body(new ZodValidationPipe(supplierSchema)) body: SupplierInput, @CurrentUser() actor: AuthUser) {
    const code = await this.numbering.next('supplier');
    const supplier = await this.prisma.supplier.create({ data: { ...body, code } as any });
    await this.audit.log({ userId: actor.id, action: 'CREATE', entity: 'Supplier', entityId: supplier.id });
    return supplier;
  }

  @Patch(':id')
  @RequirePermissions('supplier.write')
  async update(@Param('id') id: string, @Body() body: Partial<SupplierInput>, @CurrentUser() actor: AuthUser) {
    const supplier = await this.prisma.supplier.update({ where: { id }, data: body as any });
    await this.audit.log({ userId: actor.id, action: 'UPDATE', entity: 'Supplier', entityId: id });
    return supplier;
  }
}
