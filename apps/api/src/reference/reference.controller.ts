import { Body, Controller, Get, Put } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { RequirePermissions, CurrentUser, type AuthUser } from '../common/decorators';
import { AuditService } from '../common/audit.service';

@Controller('reference')
export class ReferenceController {
  constructor(
    private prisma: PrismaService,
    private audit: AuditService,
  ) {}

  @Get()
  async all() {
    const [lookups, currencies] = await Promise.all([
      this.prisma.lookup.findMany({ where: { isActive: true }, orderBy: { sort: 'asc' } }),
      this.prisma.currency.findMany(),
    ]);
    const grouped: Record<string, unknown[]> = {};
    for (const l of lookups) {
      (grouped[l.type] ??= []).push({
        code: l.code,
        nameEn: l.nameEn,
        nameOm: l.nameOm,
      });
    }
    return { lookups: grouped, currencies };
  }

  @Get('settings')
  @RequirePermissions('settings.manage')
  async settings() {
    const rows = await this.prisma.setting.findMany();
    return Object.fromEntries(rows.map((r) => [r.key, r.value]));
  }

  @Put('settings')
  @RequirePermissions('settings.manage')
  async updateSettings(@Body() body: Record<string, unknown>, @CurrentUser() actor: AuthUser) {
    for (const [key, value] of Object.entries(body)) {
      await this.prisma.setting.upsert({
        where: { key },
        create: { key, value: value as any },
        update: { value: value as any },
      });
    }
    await this.audit.log({ userId: actor.id, action: 'UPDATE', entity: 'Setting', after: body });
    return { ok: true };
  }
}
