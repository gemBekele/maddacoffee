import { Controller, Get, Header, Param, Query, Res } from '@nestjs/common';
import type { Response } from 'express';
import { PdfService } from './pdf.service';
import { RequirePermissions } from '../common/decorators';

/**
 * Printable PDFs for every document in an export pack.
 *
 * Documents are addressed by their document type rather than an opaque id, so a
 * link in an email or a bookmark reads as what it is. The type is URL-encoded
 * because the names contain spaces.
 */
@Controller('documents')
export class DocumentsController {
  constructor(private pdf: PdfService) {}

  private send(res: Response, filename: string, buffer: Buffer, inline: boolean) {
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader(
      'Content-Disposition',
      `${inline ? 'inline' : 'attachment'}; filename="${filename}"`,
    );
    res.setHeader('Content-Length', buffer.length.toString());
    res.end(buffer);
  }

  /** Everything printable for a consignment, with a download link per item. */
  @Get('invoice/:id')
  @RequirePermissions('commercial.read')
  async list(@Param('id') id: string) {
    const pack = await this.pdf.packForInvoice(id);
    return {
      count: pack.length,
      documents: pack.map((d) => ({
        docType: d.docType,
        filename: d.filename,
        bytes: d.buffer.length,
        isPrimaryDocument: d.isPrimaryDocument,
        url: `/api/documents/invoice/${id}/${encodeURIComponent(d.docType)}`,
      })),
    };
  }

  /** Render one document type for a commercial invoice. */
  @Get('invoice/:id/:docType')
  @RequirePermissions('commercial.read')
  async one(
    @Param('id') id: string,
    @Param('docType') docType: string,
    @Query('inline') inline: string,
    @Res() res: Response,
  ) {
    const rendered = await this.pdf.renderForInvoice(id, decodeURIComponent(docType));
    this.send(res, rendered.filename, rendered.buffer, inline === '1' || inline === 'true');
  }

  @Get('proforma/:id')
  @RequirePermissions('proforma.read')
  async proforma(@Param('id') id: string, @Query('inline') inline: string, @Res() res: Response) {
    const r = await this.pdf.proformaInvoice(id);
    this.send(res, r.filename, r.buffer, inline === '1' || inline === 'true');
  }

  @Get('contract/:id')
  @RequirePermissions('contract.read')
  async contract(@Param('id') id: string, @Query('inline') inline: string, @Res() res: Response) {
    const r = await this.pdf.salesContract(id);
    this.send(res, r.filename, r.buffer, inline === '1' || inline === 'true');
  }

  /** Payroll register for a month. */
  @Get('payroll/:runId')
  @RequirePermissions('payroll.read')
  async payroll(@Param('runId') runId: string, @Query('inline') inline: string, @Res() res: Response) {
    const r = await this.pdf.payrollRegister(runId);
    this.send(res, r.filename, r.buffer, inline === '1' || inline === 'true');
  }

  /** One employee's payslip. */
  @Get('payroll/:runId/payslip/:lineId')
  @RequirePermissions('payroll.read')
  async payslip(
    @Param('runId') runId: string,
    @Param('lineId') lineId: string,
    @Query('inline') inline: string,
    @Res() res: Response,
  ) {
    const r = await this.pdf.payslip(runId, lineId);
    this.send(res, r.filename, r.buffer, inline === '1' || inline === 'true');
  }
}
