import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  NotFoundException,
  Param,
  Patch,
  Post,
} from '@nestjs/common';
import { ComplianceService } from './compliance.service';
import { PrismaService } from '../prisma/prisma.service';
import { RequirePermissions, CurrentUser, type AuthUser } from '../common/decorators';
import { ZodValidationPipe } from '../common/zod.pipe';
import {
  producerSchema,
  plotSchema,
  eudrStatementSchema,
  type ProducerInput,
  type PlotInput,
  type EudrStatementInput,
} from '@madda/shared';

/**
 * Traceability: producers, plots, and which farms reached which shipment.
 *
 * The EUDR question ("which farms contributed to this export?") is answered by
 * walking shipment -> commercial invoice line -> lotId -> LotTrace -> Plot.
 * LotTrace is the join that makes both directions possible.
 */
@Controller('traceability')
export class TraceabilityController {
  constructor(
    private prisma: PrismaService,
    private compliance: ComplianceService,
  ) {}

  // ── Producers ───────────────────────────────────────────────────────────

  @Get('producers')
  @RequirePermissions('quality.read')
  producers() {
    return this.prisma.producer.findMany({
      include: { _count: { select: { plots: true } } },
      orderBy: { name: 'asc' },
    });
  }

  @Post('producers')
  @RequirePermissions('quality.write')
  async createProducer(
    @Body(new ZodValidationPipe(producerSchema)) body: ProducerInput,
    @CurrentUser() actor: AuthUser,
  ) {
    return this.prisma.producer.create({ data: body });
  }

  @Patch('producers/:id')
  @RequirePermissions('quality.write')
  updateProducer(@Param('id') id: string, @Body() body: any) {
    return this.prisma.producer.update({ where: { id }, data: body });
  }

  @Delete('producers/:id')
  @RequirePermissions('quality.write')
  async deleteProducer(@Param('id') id: string) {
    // Plots cascade, but LotTrace rows are the audit trail for a shipped lot.
    // Refuse rather than silently destroying traceability.
    const traceCount = await this.prisma.lotTrace.count({ where: { plot: { producerId: id } } });
    if (traceCount > 0) {
      return {
        error:
          `Cannot delete: ${traceCount} lot trace record(s) reference this producer's plots. ` +
          'Mark the producer inactive instead so shipped-lot history survives.',
      };
    }
    await this.prisma.producer.delete({ where: { id } });
    return { ok: true };
  }

  // ── Plots ────────────────────────────────────────────────────────────────

  @Get('producers/:id/plots')
  @RequirePermissions('quality.read')
  plots(@Param('id') producerId: string) {
    return this.prisma.plot.findMany({ where: { producerId }, orderBy: { kebele: 'asc' } });
  }

  @Post('plots')
  @RequirePermissions('quality.write')
  async createPlot(@Body(new ZodValidationPipe(plotSchema)) body: PlotInput) {
    const producer = await this.prisma.producer.findUnique({ where: { id: body.producerId } });
    if (!producer) throw new NotFoundException(`Producer ${body.producerId} not found`);

    // EUDR requires six decimal digits for coordinates. Reject anything less
    // precise now rather than at DDS submission time.
    if (body.polygon) {
      const serialised = JSON.stringify(body.polygon);
      if (serialised && !/[0-9]\.\d{6}/.test(serialised)) {
        throw new BadRequestException(
          'Coordinates need at least six decimal digits to satisfy EUDR Art. 9(1)(d). ' +
            'The value submitted looks less precise than that.',
        );
      }
    }
    return this.prisma.plot.create({ data: body });
  }

  @Patch('plots/:id')
  @RequirePermissions('quality.write')
  updatePlot(@Param('id') id: string, @Body() body: any) {
    return this.prisma.plot.update({ where: { id }, data: body });
  }

  @Delete('plots/:id')
  @RequirePermissions('quality.write')
  async deletePlot(@Param('id') id: string) {
    const traceCount = await this.prisma.lotTrace.count({ where: { plotId: id } });
    if (traceCount > 0) {
      return { error: `Cannot delete: ${traceCount} lot trace record(s) reference this plot.` };
    }
    await this.prisma.plot.delete({ where: { id } });
    return { ok: true };
  }

  // ── The three questions ──────────────────────────────────────────────────

  /** Which farms and plots contributed to this shipment? */
  @Get('shipment/:id/plots')
  @RequirePermissions('shipment.read')
  async shipmentPlots(@Param('id') shipmentId: string) {
    const shipment = await this.prisma.shipment.findUnique({
      where: { id: shipmentId },
      include: { contract: { include: { commercial: { include: { lines: true } }, proforma: { include: { lines: true } } } } },
    });
    if (!shipment) return { error: 'Not found' };

    const contract = shipment.contract;
    const lines = contract?.commercial?.lines ?? contract?.proforma?.lines ?? [];
    const lotIds = [...new Set(lines.map((l: any) => l.lotId).filter(Boolean))] as string[];

    if (!lotIds.length) {
      return { lotIds: [], plots: [], producers: [], note: 'No lots on this shipment yet.' };
    }

    const traces = await this.prisma.lotTrace.findMany({
      where: { lotId: { in: lotIds } },
      include: { plot: { include: { producer: true } }, lot: true },
      orderBy: { lotId: 'asc' },
    });

    const byPlot = new Map<string, any>();
    for (const t of traces) {
      const key = t.plotId;
      const cur = byPlot.get(key) ?? {
        plotId: key,
        plot: t.plot,
        producer: t.plot.producer,
        lots: new Set<string>(),
        contributedKg: 0,
      };
      cur.lots.add(t.lotId);
      cur.contributedKg += Number(t.contributedKg ?? 0);
      byPlot.set(key, cur);
    }

    return {
      lotIds,
      plots: [...byPlot.values()].map((p) => ({
        ...p,
        lots: [...p.lots],
        geolocated: !!p.plot.polygon,
      })),
      producers: [...new Set([...byPlot.values()].map((p) => p.producer?.id).filter(Boolean))],
      missingGeolocation: [...byPlot.values()].filter((p) => !p.plot.polygon).map((p) => p.plotId),
    };
  }

  /** Which shipments contain coffee from this lot? */
  @Get('lot/:lotId/shipments')
  @RequirePermissions('shipment.read')
  async lotShipments(@Param('lotId') lotId: string) {
    const commercialLines = await this.prisma.commercialInvoiceLine.findMany({
      where: { lotId },
      include: { invoice: { include: { contract: { include: { shipment: true } } } } },
    });
    // The relation field on ProformaInvoiceLine is `proforma`, not `invoice`.
    const proformaLines = await this.prisma.proformaInvoiceLine.findMany({
      where: { lotId },
      include: { proforma: { include: { contract: { include: { shipment: true } } } } },
    });

    const rows = [
      ...commercialLines.map((l) => ({
        kind: 'CommercialInvoice',
        code: l.invoice.code,
        date: l.invoice.date,
        status: l.invoice.status,
        quantityKg: l.quantityKg,
        amount: l.amount,
        shipment: l.invoice.contract?.shipment ?? null,
      })),
      ...proformaLines.map((l) => ({
        kind: 'ProformaInvoice',
        code: l.proforma.code,
        date: l.proforma.date,
        status: l.proforma.status,
        quantityKg: l.quantityKg,
        amount: l.amount,
        shipment: l.proforma.contract?.shipment ?? null,
      })),
    ];
    return { lotId, invoices: rows };
  }

  /** Which certificates and quality results belong to this lot? */
  @Get('lot/:lotId/documents')
  @RequirePermissions('quality.read')
  async lotDocuments(@Param('lotId') lotId: string) {
    const lot = await this.prisma.lot.findUnique({
      where: { lotId },
      include: {
        documents: true,
        station: true,
        batches: { orderBy: { date: 'desc' } },
      },
    });
    if (!lot) return { error: 'Not found' };

    return {
      lot,
      documents: lot.documents,
      batches: lot.batches,
      // Traceability gap: a lot exported to the EU with no CLU certificate is a
      // compliance problem, so surface the gap rather than leaving it implicit.
      gaps: [
        ...(lot.documents.some((d) => d.docType === 'CLU Quality Certificate')
          ? []
          : [{ kind: 'MISSING_CLU_CERT', message: 'No CLU quality certificate recorded for this lot.' }]),
        ...(!lot.moisturePct ? [{ kind: 'NO_MOISTURE', message: 'Moisture percentage not recorded.' }] : []),
        ...(!lot.cuppingScore ? [{ kind: 'NO_CUP_SCORE', message: 'Cupping score not recorded.' }] : []),
        ...(!lot.bagNumbers ? [{ kind: 'NO_BAG_NUMBERS', message: 'Bag numbers not recorded; ICO requires a mark or UCR per bag.' }] : []),
        ...(!lot.ecxWarehouseReceipt && !lot.origin
          ? [{ kind: 'NO_ORIGIN', message: 'Origin not recorded.' }]
          : []),
      ],
    };
  }

  // ── LotTrace linking ─────────────────────────────────────────────────────

  @Post('lot-traces')
  @RequirePermissions('quality.write')
  async linkTrace(@Body() body: any) {
    const { lotId, plotId, contributedKg } = body;
    return this.prisma.lotTrace.upsert({
      where: { lotId_plotId: { lotId, plotId } },
      create: { lotId, plotId, contributedKg: contributedKg ?? 0 },
      update: { contributedKg: contributedKg ?? 0 },
    });
  }

  @Delete('lot-traces/:lotId/:plotId')
  @RequirePermissions('quality.write')
  async unlinkTrace(@Param('lotId') lotId: string, @Param('plotId') plotId: string) {
    await this.prisma.lotTrace.delete({ where: { lotId_plotId: { lotId, plotId } } });
    return { ok: true };
  }

  /** Bulk-link the cherry purchases behind a lot to their producers' plots. */
  @Post('lot/:lotId/derive-traces')
  @RequirePermissions('quality.write')
  async deriveTraces(@Param('lotId') lotId: string) {
    const lot = await this.prisma.lot.findUnique({ where: { lotId } });
    if (!lot) return { error: 'Not found' };

    // Walk batches -> station -> purchases -> supplier -> producer -> plots.
    const batches = await this.prisma.processingBatch.findMany({ where: { lotId } });
    const stationIds = [...new Set(batches.map((b) => b.stationId))];
    if (!stationIds.length) return { created: 0, note: 'No processing batches reference this lot.' };

    const purchases = await this.prisma.cherryPurchase.findMany({
      where: { stationId: { in: stationIds } },
      include: { supplier: true },
    });

    let created = 0;
    let unlinked = 0;
    for (const purchase of purchases) {
      if (!purchase.supplier.producerId) {
        unlinked++;
        continue;
      }
      const plots = await this.prisma.plot.findMany({
        where: { producerId: purchase.supplier.producerId },
        select: { id: true },
      });
      for (const plot of plots) {
        await this.prisma.lotTrace.upsert({
          where: { lotId_plotId: { lotId, plotId: plot.id } },
          create: { lotId, plotId: plot.id, contributedKg: 0, cherryPurchaseId: purchase.id },
          update: {},
        });
        created++;
      }
    }

    return {
      created,
      unlinkedPurchases: unlinked,
      note:
        unlinked > 0
          ? `${unlinked} purchase(s) had a supplier with no linked producer, so their plots could not be derived. Link the supplier to a producer first.`
          : undefined,
    };
  }

  // ── EUDR ─────────────────────────────────────────────────────────────────

  @Get('eudr/:shipmentId')
  @RequirePermissions('shipment.read')
  async eudr(@Param('shipmentId') shipmentId: string) {
    const shipment = await this.prisma.shipment.findUnique({
      where: { id: shipmentId },
      include: {
        eudr: { include: { plotLinks: { include: { plot: { include: { producer: true } } } } } },
        contract: { include: { commercial: { select: { destinationCountryCode: true, destinationCountryName: true } } } },
      },
    });
    if (!shipment) return { error: 'Not found' };

    const plots = await this.traceabilityPlots(shipmentId);

    return {
      // Destination lives on the commercial invoice, not the shipment.
      shipment: {
        id: shipment.id,
        code: shipment.code,
        destination: shipment.contract?.commercial?.destinationCountryName ?? null,
      },
      statement: shipment.eudr,
      plotCount: plots.plots.length,
      geolocatedCount: plots.plots.filter((p: any) => p.geolocated).length,
      missingGeolocation: plots.missingGeolocation,
      producers: plots.producers,
      // We do not file. The EU importer does; we supply this data.
      responsibility:
        'The Due Diligence Statement is submitted by the EU importer or operator in the EUDR Information System (TRACES). MADDA supplies plot geolocation and legality evidence and records the reference returned.',
      officialUrl: 'https://green-forum.ec.europa.eu/nature-and-biodiversity/deforestation-regulation-implementation_en',
      applicationDate: '2026-12-30',
    };
  }

  /**
   * GeoJSON FeatureCollection of every contributing plot.
   *
   * This is the deliverable an EU importer actually asks for. Plots without a
   * polygon are reported separately rather than silently omitted, because a
   * silently incomplete DDS is worse than a visible gap.
   */
  @Get('eudr/:shipmentId/geojson')
  @RequirePermissions('shipment.read')
  async geojson(@Param('shipmentId') shipmentId: string) {
    const shipment = await this.prisma.shipment.findUnique({
      where: { id: shipmentId },
      include: { contract: { include: { commercial: { select: { destinationCountryCode: true } } } } },
    });
    if (!shipment) return { error: 'Not found' };

    const traces = await this.tracesForShipment(shipmentId);
    const features: any[] = [];
    const missing: any[] = [];

    for (const t of traces) {
      if (!t.plot.polygon) {
        missing.push({ plotId: t.plotId, producer: t.plot.producer?.name, lotId: t.lotId });
        continue;
      }
      features.push({
        type: 'Feature',
        geometry: t.plot.polygon,
        properties: {
          plotId: t.plot.id,
          producerCode: t.plot.producer?.code,
          producerName: t.plot.producer?.name,
          producerKind: t.plot.producer?.kind,
          region: t.plot.region,
          zone: t.plot.zone,
          woreda: t.plot.woreda,
          kebele: t.plot.kebele,
          areaHa: t.plot.areaHa ? Number(t.plot.areaHa) : null,
          landTenure: t.plot.landTenure,
          legalityDocRef: t.plot.legalityDocRef,
          harvestedFrom: t.plot.harvestedFrom,
          harvestedTo: t.plot.harvestedTo,
          geolocationMethod: t.plot.geolocationMethod,
          lots: t.lots,
          // Polygons are mandatory above 4 ha (EUDR Art. 9(1)(d)).
          requiresPolygon: t.plot.areaHa ? Number(t.plot.areaHa) > 4 : null,
        },
      });
    }

    return {
      type: 'FeatureCollection',
      crs: { type: 'name', properties: { name: 'urn:ogc:def:crs:OGC:1.3:CRS84' } },
      features,
      meta: {
        shipmentCode: shipment.code,
        destinationCountry: shipment.contract?.commercial?.destinationCountryCode ?? null,
        countryOfProduction: 'Ethiopia',
        commodity: 'Coffee',
        generatedAt: new Date().toISOString(),
        plotCount: features.length,
        missingGeolocation: missing,
        note:
          'Geolocation data supplied to the EU importer for their Due Diligence Statement under Regulation (EU) 2023/1115. WGS-84 / EPSG:4326, six decimal digits.',
      },
    };
  }

  @Post('eudr/:shipmentId/link-plots')
  @RequirePermissions('shipment.read')
  async linkEudrPlots(@Param('shipmentId') shipmentId: string) {
    const shipment = await this.prisma.shipment.findUnique({ where: { id: shipmentId } });
    if (!shipment) return { error: 'Not found' };

    const eudr = await this.prisma.eudrStatement.upsert({
      where: { shipmentId },
      create: { shipmentId },
      update: {},
    });

    const traces = await this.tracesForShipment(shipmentId);
    let linked = 0;
    for (const t of traces) {
      await this.prisma.eudrPlotLink.upsert({
        where: { eudrStatementId_plotId: { eudrStatementId: eudr.id, plotId: t.plotId } },
        create: {
          eudrStatementId: eudr.id,
          plotId: t.plotId,
          geolocationSuppliedAt: t.plot.polygon ? new Date() : null,
        },
        update: {},
      });
      linked++;
    }

    await this.prisma.eudrStatement.update({
      where: { id: eudr.id },
      data: { status: traces.some((t) => !t.plot.polygon) ? 'GeodataPending' : 'GeodataReady' },
    });

    return { eudrStatementId: eudr.id, linked };
  }

  @Patch('eudr/:shipmentId')
  @RequirePermissions('shipment.write')
  async updateEudr(
    @Param('shipmentId') shipmentId: string,
    @Body(new ZodValidationPipe(eudrStatementSchema)) body: EudrStatementInput,
    @CurrentUser() actor: AuthUser,
  ) {
    const eudr = await this.prisma.eudrStatement.upsert({
      where: { shipmentId },
      create: { shipmentId, ...body },
      update: body,
    });
    return eudr;
  }

  private async tracesForShipment(shipmentId: string) {
    const shipment = await this.prisma.shipment.findUnique({
      where: { id: shipmentId },
      include: {
        contract: { include: { commercial: { include: { lines: true } }, proforma: { include: { lines: true } } } },
      },
    });
    const contract = shipment?.contract;
    const lines = contract?.commercial?.lines ?? contract?.proforma?.lines ?? [];
    const lotIds = [...new Set(lines.map((l: any) => l.lotId).filter(Boolean))] as string[];
    if (!lotIds.length) return [];

    const traces = await this.prisma.lotTrace.findMany({
      where: { lotId: { in: lotIds } },
      include: { plot: { include: { producer: true } } },
    });

    // Merge traces that resolve to the same plot across lots.
    const byPlot = new Map<string, any>();
    for (const t of traces) {
      const cur = byPlot.get(t.plotId);
      if (cur) {
        cur.lots.push(t.lotId);
      } else {
        byPlot.set(t.plotId, { plotId: t.plotId, plot: t.plot, lots: [t.lotId] });
      }
    }
    return [...byPlot.values()];
  }

  private async traceabilityPlots(shipmentId: string) {
    const traces = await this.tracesForShipment(shipmentId);
    return {
      plots: traces.map((t) => ({ plotId: t.plotId, plot: t.plot, producer: t.plot.producer, lots: t.lots, geolocated: !!t.plot.polygon })),
      producers: [...new Set(traces.map((t) => t.plot.producer?.id).filter(Boolean))],
      missingGeolocation: traces.filter((t) => !t.plot.polygon).map((t) => t.plotId),
    };
  }
}
