import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { PrismaService } from '../prisma/prisma.service';
import { permissionsForRoles, type Role } from '@madda/shared';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(private prisma: PrismaService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: process.env.JWT_SECRET || 'dev-secret',
    });
  }

  async validate(payload: { sub: string }) {
    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
      include: { roles: { include: { role: true } }, stations: true },
    });
    if (!user || !user.isActive) throw new UnauthorizedException();
    const roles = user.roles.map((r) => r.role.key) as Role[];
    return {
      id: user.id,
      email: user.email,
      name: user.name,
      language: user.language,
      roles,
      permissions: permissionsForRoles(roles),
      stationIds: user.stations.map((s) => s.stationId),
    };
  }
}
