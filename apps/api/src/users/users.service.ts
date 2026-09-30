import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../common/audit.service';
import type { CreateUserInput } from '@madda/shared';

@Injectable()
export class UsersService {
  constructor(
    private prisma: PrismaService,
    private audit: AuditService,
  ) {}

  async list() {
    const users = await this.prisma.user.findMany({
      include: { roles: { include: { role: true } }, stations: { include: { station: true } } },
      orderBy: { createdAt: 'desc' },
    });
    return users.map((u) => ({
      id: u.id,
      name: u.name,
      email: u.email,
      phone: u.phone,
      language: u.language,
      isActive: u.isActive,
      lastLoginAt: u.lastLoginAt,
      roles: u.roles.map((r) => r.role.key),
      stations: u.stations.map((s) => ({ id: s.stationId, name: s.station.name })),
    }));
  }

  async create(input: CreateUserInput, actorId?: string) {
    const exists = await this.prisma.user.findUnique({ where: { email: input.email } });
    if (exists) throw new BadRequestException('Email already in use');
    const passwordHash = await bcrypt.hash(input.password, 10);
    const user = await this.prisma.user.create({
      data: {
        name: input.name,
        email: input.email,
        passwordHash,
        phone: input.phone ?? null,
        language: input.language,
        roles: {
          create: input.roles.map((key) => ({ role: { connect: { key } } })),
        },
        stations: {
          create: input.stationIds.map((id) => ({ station: { connect: { id } } })),
        },
      },
    });
    await this.audit.log({ userId: actorId, action: 'CREATE', entity: 'User', entityId: user.id });
    return { id: user.id };
  }

  async update(
    id: string,
    input: Partial<CreateUserInput> & { isActive?: boolean },
    actorId?: string,
  ) {
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user) throw new NotFoundException('User not found');
    const data: any = {};
    if (input.name) data.name = input.name;
    if (input.phone !== undefined) data.phone = input.phone;
    if (input.language) data.language = input.language;
    if (input.isActive !== undefined) data.isActive = input.isActive;
    if (input.password) data.passwordHash = await bcrypt.hash(input.password, 10);

    if (input.roles) {
      await this.prisma.userRole.deleteMany({ where: { userId: id } });
      data.roles = { create: input.roles.map((key) => ({ role: { connect: { key } } })) };
    }
    if (input.stationIds) {
      await this.prisma.userStation.deleteMany({ where: { userId: id } });
      data.stations = { create: input.stationIds.map((sid) => ({ station: { connect: { id: sid } } })) };
    }
    await this.prisma.user.update({ where: { id }, data });
    await this.audit.log({ userId: actorId, action: 'UPDATE', entity: 'User', entityId: id });
    return { id };
  }

  async roles() {
    return this.prisma.role.findMany({ orderBy: { key: 'asc' } });
  }
}
