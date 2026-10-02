import { Body, Controller, Get, Param, Patch, Post } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../common/audit.service';
import { NumberingService } from '../common/numbering.service';
import { RequirePermissions, CurrentUser, type AuthUser } from '../common/decorators';
import { ZodValidationPipe } from '../common/zod.pipe';
import { stationSchema, type StationInput, formatLotId } from '@madda/shared';
import { stationFilter } from '../common/station-scope';

@Controller('stations')
export class StationsController {
  constructor(private prisma: PrismaService, private audit: AuditService, private numbering: NumberingService) {}

  @Get()
  @RequirePermissions('station.read')
  list(@CurrentUser() user?: AuthUser) {
    // Scoped users see only their own stations, so the picker cannot offer one
    // they have no access to.
    const reach = stationFilter(user!);
    return this.prisma.station.findMany({
      where: reach.stationId ? { id: reach.stationId as any } : {},
      orderBy: { code: 'asc' },
    });
  }

  @Get(':id')
  @RequirePermissions('station.read')
  one(@Param('id') id: string) {
    return this.prisma.station.findUnique({ where: { id } });
  }

  @Post()
  @RequirePermissions('station.write')
  async create(@Body(new ZodValidationPipe(stationSchema)) body: StationInput, @CurrentUser() actor: AuthUser) {
    const code = body.code || (await this.numbering.next('station'));
    const station = await this.prisma.station.create({
      data: {
        code,
        name: body.name,
        region: body.region ?? null,
        zone: body.zone ?? null,
        location: body.location ?? null,
        manager: body.manager ?? null,
        capacityTons: body.capacityTons ?? null,
        startDate: body.startDate ?? null,
        status: body.status,
        notes: body.notes ?? null,
      },
    });
    await this.audit.log({ userId: actor.id, action: 'CREATE', entity: 'Station', entityId: station.id });
    return station;
  }

  @Patch(':id')
  @RequirePermissions('station.write')
  // Validated against a partial schema so a client cannot write arbitrary
  // columns such as code or createdAt.
  async update(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(stationSchema.partial())) body: Partial<StationInput>,
    @CurrentUser() actor: AuthUser,
  ) {
    const station = await this.prisma.station.update({ where: { id }, data: body as any });
    await this.audit.log({ userId: actor.id, action: 'UPDATE', entity: 'Station', entityId: id });
    return station;
  }
}

// helper reused by lots
export function buildLotId(stationCode: string, process: string, seq: number) {
  return formatLotId(stationCode, process, seq);
}
