import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { PrismaService } from '../prisma/prisma.service';
import { permissionsForRoles, type Role } from '@madda/shared';
import { jwtSecret } from './jwt.config';

interface JwtPayload {
  sub: string;
  /**
   * Token purpose. Access and refresh tokens are signed with the same secret,
   * so without this a 30-day refresh token was accepted everywhere an access
   * token is, which silently defeated the 15-minute session window. The
   * strategy rejects anything that is not an access token.
   */
  typ?: 'access' | 'refresh';
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(private prisma: PrismaService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: jwtSecret(),
    });
  }

  async validate(payload: JwtPayload) {
    if (payload.typ && payload.typ !== 'access') {
      throw new UnauthorizedException('Not an access token');
    }
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
