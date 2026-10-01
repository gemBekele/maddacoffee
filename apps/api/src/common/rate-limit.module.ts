import { Global, Module } from '@nestjs/common';
import { RateLimitService } from './rate-limit.service';

/**
 * Global so a controller can guard its own endpoints without every feature
 * module having to import this.
 */
@Global()
@Module({
  providers: [RateLimitService],
  exports: [RateLimitService],
})
export class RateLimitModule {}
