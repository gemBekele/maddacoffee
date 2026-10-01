import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../prisma/prisma.service';
import { permissionsForRoles, type Role } from '@madda/shared';

@Injectable()
export class AuthService {
  constructor(
    private prisma: PrismaService,
    private jwt: JwtService,
  ) {}

  async validateUser(email: string, password: string) {
    const user = await this.prisma.user.findUnique({
      where: { email },
      include: { roles: { include: { role: true } }, stations: true },
    });
    if (!user || !user.isActive) throw new UnauthorizedException('Invalid credentials');
    const ok = await bcrypt.compare(password, user.passwordHash);
    if (!ok) throw new UnauthorizedException('Invalid credentials');
    return user;
  }

  private shape(user: any) {
    const roles = user.roles.map((r: any) => r.role.key) as Role[];
    return {
      id: user.id,
      name: user.name,
      email: user.email,
      language: user.language,
      roles,
      permissions: permissionsForRoles(roles),
      stationIds: user.stations.map((s: any) => s.stationId),
    };
  }

  async login(email: string, password: string) {
    const user = await this.validateUser(email, password);
    await this.prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    });
    // The `typ` claim separates the two token kinds. Without it a refresh token
    // is accepted as an access token, so a 30-day credential works as a full
    // session and the short access TTL stops meaning anything.
    return {
      accessToken: await this.jwt.signAsync(
        { sub: user.id, typ: 'access' },
        { expiresIn: process.env.JWT_ACCESS_TTL || '15m' },
      ),
      refreshToken: await this.jwt.signAsync(
        { sub: user.id, typ: 'refresh' },
        { expiresIn: process.env.JWT_REFRESH_TTL || '30d' },
      ),
      user: this.shape(user),
    };
  }

  async refresh(refreshToken: string) {
    try {
      const payload = await this.jwt.verifyAsync<{ sub: string; typ?: string }>(refreshToken);
      // Only a refresh token may be exchanged here.
      if (payload.typ && payload.typ !== 'refresh') {
        throw new UnauthorizedException('Not a refresh token');
      }
      const user = await this.prisma.user.findUnique({
        where: { id: payload.sub },
        include: { roles: { include: { role: true } }, stations: true },
      });
      if (!user || !user.isActive) throw new UnauthorizedException();
      return {
        accessToken: await this.jwt.signAsync(
          { sub: user.id, typ: 'access' },
          { expiresIn: process.env.JWT_ACCESS_TTL || '15m' },
        ),
        user: this.shape(user),
      };
    } catch {
      throw new UnauthorizedException('Invalid refresh token');
    }
  }

  async me(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { roles: { include: { role: true } }, stations: true },
    });
    if (!user) throw new UnauthorizedException();
    return this.shape(user);
  }
}
