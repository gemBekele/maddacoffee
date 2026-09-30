import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class ActivityService {
  constructor(private prisma: PrismaService) {}

  async log(entity: string, entityId: string, type: string, message: string, actorId?: string) {
    await this.prisma.activity.create({
      data: { entity, entityId, type, message, actorId: actorId ?? null },
    });
  }

  list(entity: string, entityId: string) {
    return this.prisma.activity.findMany({
      where: { entity, entityId },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
  }
}
