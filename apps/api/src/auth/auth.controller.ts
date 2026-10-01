import { Body, Controller, Get, Post, Req, HttpException, HttpStatus } from '@nestjs/common';
import type { Request } from 'express';
import { AuthService } from './auth.service';
import { Public, CurrentUser, type AuthUser } from '../common/decorators';
import { ZodValidationPipe } from '../common/zod.pipe';
import { RateLimitService } from '../common/rate-limit.service';
import { loginSchema, type LoginInput } from '@madda/shared';

/**
 * Login throttling.
 *
 * Ten attempts per fifteen minutes per client address, and thirty per address
 * for the refresh endpoint. Generous enough that a person mistyping a password
 * is never blocked, tight enough that online guessing is not viable: without
 * this, the audit confirmed unlimited attempts were processed normally.
 *
 * A successful login clears the counter, so a legitimate user who mistyped a
 * few times is not penalised once they get in.
 */
const LOGIN_LIMIT = 10;
const LOGIN_WINDOW_MS = 15 * 60 * 1000;
const REFRESH_LIMIT = 60;
const REFRESH_WINDOW_MS = 15 * 60 * 1000;

@Controller('auth')
export class AuthController {
  constructor(
    private auth: AuthService,
    private rateLimit: RateLimitService,
  ) {}

  private clientKey(req: Request, bucket: string): string {
    // Behind the SPA's proxy the real client is X-Forwarded-For; fall back to
    // the socket address when it is absent.
    const forwarded = (req.headers['x-forwarded-for'] as string | undefined)?.split(',')[0]?.trim();
    const ip = forwarded || req.ip || req.socket?.remoteAddress || 'unknown';
    return `${bucket}:${ip}`;
  }

  @Public()
  @Post('login')
  async login(@Body(new ZodValidationPipe(loginSchema)) body: LoginInput, @Req() req: Request) {
    const key = this.clientKey(req, 'login');
    const gate = this.rateLimit.hit(key, LOGIN_LIMIT, LOGIN_WINDOW_MS);
    if (!gate.allowed) {
      throw new HttpException(
        {
          statusCode: HttpStatus.TOO_MANY_REQUESTS,
          message: `Too many login attempts. Try again in ${Math.ceil(gate.retryAfterSeconds / 60)} minute(s).`,
          retryAfterSeconds: gate.retryAfterSeconds,
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
    const result = await this.auth.login(body.email, body.password);
    // Only a real success clears the counter, so failures accumulate.
    this.rateLimit.reset(key);
    return result;
  }

  @Public()
  @Post('refresh')
  refresh(@Body('refreshToken') token: string, @Req() req: Request) {
    const key = this.clientKey(req, 'refresh');
    const gate = this.rateLimit.hit(key, REFRESH_LIMIT, REFRESH_WINDOW_MS);
    if (!gate.allowed) {
      throw new HttpException(
        { statusCode: HttpStatus.TOO_MANY_REQUESTS, message: 'Too many refresh attempts.' },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
    return this.auth.refresh(token);
  }

  @Get('me')
  me(@CurrentUser() user: AuthUser) {
    return this.auth.me(user.id);
  }
}
