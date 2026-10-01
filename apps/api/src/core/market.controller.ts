import { Controller, Get, Query } from '@nestjs/common';
import { MarketService, type Range } from './market.service';
import { RequirePermissions } from '../common/decorators';

const RANGES: Range[] = ['1d', '5d', '1mo', '3mo', '6mo', '1y', '5y'];

/**
 * Coffee benchmark prices.
 *
 * Read-only. Upstream failures degrade to cached data with a staleness flag
 * rather than an error, so the dashboard keeps working when the feed does not.
 */
@Controller('market')
export class MarketController {
  constructor(private market: MarketService) {}

  private parseRange(value?: string): Range {
    return (RANGES as string[]).includes(value ?? '') ? (value as Range) : '1mo';
  }

  @Get('coffee')
  @RequirePermissions('market.read')
  benchmark(@Query('range') range?: string) {
    return this.market.benchmark(this.parseRange(range));
  }

  /** Benchmark against our own realised export prices. */
  @Get('compare')
  @RequirePermissions('market.read')
  compare(@Query('range') range?: string) {
    return this.market.compare(this.parseRange(range));
  }

  @Get('realised')
  @RequirePermissions('market.read')
  realised(@Query('days') days?: string) {
    return this.market.realised(days ? Number(days) : 365);
  }

  /** Feed health, so a silently dead data source is visible. */
  @Get('health')
  @RequirePermissions('market.read')
  health() {
    return this.market.health();
  }
}
