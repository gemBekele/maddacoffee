import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../common/audit.service';
import { RequirePermissions, CurrentUser, type AuthUser } from '../common/decorators';

@Controller('inventory')
export class InventoryController {
  constructor(private prisma: PrismaService, private audit: AuditService) {}

  @Get()
  @RequirePermissions('inventory.read')
  list(@Query('stationId') stationId?: string) {
    return this.prisma.inventoryItem.findMany({
      where: stationId ? { stationId } : {},
      include: { lot: true },
      orderBy: { updatedAt: 'desc' },
      take: 500,
    });
  }

  @Get('lots')
  @RequirePermissions('inventory.read')
  lots(@Query('stationId') stationId?: string) {
    return this.prisma.lot.findMany({
      where: stationId ? { stationId } : {},
      include: { station: true, inventory: true },
      orderBy: { createdAt: 'desc' },
      take: 500,
    });
  }

  @Get(':id/movements')
  @RequirePermissions('inventory.read')
  movements(@Param('id') id: string) {
    return this.prisma.inventoryMovement.findMany({
      where: { itemId: id },
      orderBy: { createdAt: 'desc' },
    });
  }

  @Post(':id/adjust')
  @RequirePermissions('inventory.write')
  async adjust(
    @Param('id') id: string,
    @Body() body: { direction: 'IN' | 'OUT' | 'ADJUST'; quantityKg: number; unitCost?: number; notes?: string },
    @CurrentUser() actor: AuthUser,
  ) {
    const item = await this.prisma.inventoryItem.findUnique({ where: { id } });
    if (!item) throw new BadRequestException('Inventory item not found');
    const qty = Number(body.quantityKg);
    const current = Number(item.quantityKg);
    let next = current;
    if (body.direction === 'IN') next = current + qty;
    else if (body.direction === 'OUT') next = current - qty;
    else next = qty;
    if (next < 0) throw new BadRequestException('Insufficient stock for this lot');

    await this.prisma.$transaction([
      this.prisma.inventoryItem.update({
        where: { id },
        data: { quantityKg: next, ...(body.unitCost != null ? { unitCost: body.unitCost } : {}) },
      }),
      this.prisma.inventoryMovement.create({
        data: {
          itemId: id,
          direction: body.direction,
          quantityKg: qty,
          unitCost: body.unitCost ?? 0,
          notes: body.notes ?? null,
          createdById: actor.id,
        },
      }),
    ]);
    await this.audit.log({ userId: actor.id, action: 'ADJUST', entity: 'InventoryItem', entityId: id, after: { next } });
    return this.prisma.inventoryItem.findUnique({ where: { id }, include: { lot: true } });
  }
}
