import PDFDocument from 'pdfkit';

/**
 * Shared PDF layout for every document the ERP produces.
 *
 * Built on the PDFKit built-in fonts (Helvetica) rather than an embedded
 * typeface: it keeps the deploy to a single npm dependency with no font files
 * to ship, and the documents render identically everywhere.
 *
 * Two rules this module exists to enforce:
 *
 *  1. Pagination is manual for tables. PDFKit paginates flowing text but not
 *     tables, so a long invoice would silently overflow the page and the
 *     remainder would be lost. `table()` repeats the header row on each page.
 *
 *  2. The footer is stamped after layout, once the total page count is known,
 *     because "Page 1 of 3" cannot be written while page 3 does not exist yet.
 */

// Palette mirrors the web app's Tailwind theme so printed and on-screen
// documents look like the same product.
export const COLOURS = {
  brand: '#2a3f26',
  brandMid: '#4c6b46',
  brandLight: '#e0e9de',
  copper: '#ad7846',
  copperLight: '#f5e6d5',
  ink: '#1f2937',
  body: '#374151',
  muted: '#6b7280',
  faint: '#9ca3af',
  rule: '#e5e7eb',
  surface: '#f9fafb',
  white: '#ffffff',
} as const;

// A4 in points.
export const PAGE = { width: 595.28, height: 841.89 };
export const MARGIN = { top: 46, bottom: 58, left: 44, right: 44 };
const CONTENT_WIDTH = PAGE.width - MARGIN.left - MARGIN.right;

export interface CompanyInfo {
  name: string;
  addressLines: string[];
  email?: string | null;
  phone?: string | null;
  tin?: string | null;
}

export interface Column {
  header: string;
  width: number; // fraction of content width
  align?: 'left' | 'right' | 'center';
  key?: string;
  /** Custom cell renderer, for money/weight formatting. */
  render?: (row: any, index: number) => string;
}

export interface DocumentMeta {
  title: string;
  /** Short identifier shown top-right, e.g. the invoice number. */
  reference?: string;
  status?: string;
  company: CompanyInfo;
}

export class DocumentBuilder {
  readonly doc: PDFKit.PDFDocument;
  private meta: DocumentMeta;
  private y = MARGIN.top;
  /** Printed at the bottom of every page. */
  private footerNote: string;

  constructor(meta: DocumentMeta, footerNote = '') {
    this.meta = meta;
    this.footerNote = footerNote;
    this.doc = new PDFDocument({
      size: 'A4',
      margins: MARGIN,
      // Required so footers can be stamped after the page count is known.
      bufferPages: true,
      info: {
        Title: `${meta.title}${meta.reference ? ` ${meta.reference}` : ''}`,
        Author: meta.company.name,
        Creator: 'MADDA ERP',
      },
    });
    this.drawHeader();
  }

  // ── layout primitives ────────────────────────────────────────────────

  private get contentWidth() {
    return CONTENT_WIDTH;
  }

  private ensureSpace(height: number) {
    if (this.y + height > PAGE.height - MARGIN.bottom) {
      this.doc.addPage();
      this.y = this.pageTop();
      this.drawContinuation();
    }
  }

  /** Top of the writable area on a continuation page. */
  private pageTop() {
    return MARGIN.top + 8;
  }

  private drawHeader() {
    const { doc, meta } = this;
    const right = MARGIN.left + CONTENT_WIDTH;

    // Company name
    doc
      .fillColor(COLOURS.brand)
      .font('Helvetica-Bold')
      .fontSize(15)
      .text(meta.company.name, MARGIN.left, MARGIN.top, { width: CONTENT_WIDTH * 0.6 });

    const afterName = doc.y;

    // Document title, right aligned on the same band.
    doc
      .fillColor(COLOURS.copper)
      .font('Helvetica-Bold')
      .fontSize(13)
      .text(meta.title.toUpperCase(), MARGIN.left, MARGIN.top + 1, {
        width: CONTENT_WIDTH,
        align: 'right',
      });
    if (meta.reference) {
      doc
        .fillColor(COLOURS.muted)
        .font('Helvetica')
        .fontSize(9)
        .text(meta.reference, MARGIN.left, MARGIN.top + 19, { width: CONTENT_WIDTH, align: 'right' });
    }

    // Company contact line under the name.
    const contact = [meta.company.email, meta.company.phone, meta.company.tin ? `TIN ${meta.company.tin}` : null]
      .filter(Boolean)
      .join('  ·  ');
    if (contact) {
      doc
        .fillColor(COLOURS.muted)
        .font('Helvetica')
        .fontSize(8)
        .text(contact, MARGIN.left, afterName + 2, { width: CONTENT_WIDTH * 0.7 });
    }

    this.y = Math.max(doc.y, MARGIN.top + 42) + 6;
    doc
      .moveTo(MARGIN.left, this.y)
      .lineTo(right, this.y)
      .lineWidth(1.4)
      .strokeColor(COLOURS.copper)
      .stroke();
    this.y += 14;
  }

  /** Continuation header for pages after the first. */
  private drawContinuation() {
    const { doc, meta } = this;
    doc
      .fillColor(COLOURS.brand)
      .font('Helvetica-Bold')
      .fontSize(9)
      .text(meta.company.name, MARGIN.left, MARGIN.top - 14, { width: CONTENT_WIDTH * 0.5 });
    doc
      .fillColor(COLOURS.muted)
      .font('Helvetica')
      .fontSize(8)
      .text(`${meta.title}${meta.reference ? ` ${meta.reference}` : ''} (continued)`, MARGIN.left, MARGIN.top - 14, {
        width: CONTENT_WIDTH,
        align: 'right',
      });
    doc.moveTo(MARGIN.left, MARGIN.top - 3).lineTo(MARGIN.left + CONTENT_WIDTH, MARGIN.top - 3).lineWidth(0.6).strokeColor(COLOURS.rule).stroke();
  }

  space(height = 10) {
    this.y += height;
  }

  sectionTitle(text: string) {
    this.ensureSpace(26);
    this.doc
      .fillColor(COLOURS.brand)
      .font('Helvetica-Bold')
      .fontSize(10)
      .text(text.toUpperCase(), MARGIN.left, this.y, { characterSpacing: 0.6 });
    this.y = this.doc.y + 5;
    this.doc
      .moveTo(MARGIN.left, this.y)
      .lineTo(MARGIN.left + CONTENT_WIDTH, this.y)
      .lineWidth(0.6)
      .strokeColor(COLOURS.rule)
      .stroke();
    this.y += 8;
  }

  paragraph(text: string, opts: { size?: number; colour?: string; width?: number } = {}) {
    const size = opts.size ?? 9.5;
    this.doc
      .fillColor(opts.colour ?? COLOURS.body)
      .font('Helvetica')
      .fontSize(size)
      .text(text, MARGIN.left, this.y, { width: opts.width ?? CONTENT_WIDTH, align: 'left', lineGap: 2 });
    this.y = this.doc.y + 4;
  }

  /** A two- or three-column label/value grid, for header blocks. */
  keyValues(items: { label: string; value?: string | null }[], columns = 2) {
    const filtered = items.filter((i) => i.value !== null && i.value !== undefined && i.value !== '');
    if (!filtered.length) return;
    const colWidth = CONTENT_WIDTH / columns;
    const rowHeight = 26;
    const rows = Math.ceil(filtered.length / columns);

    for (let r = 0; r < rows; r++) {
      this.ensureSpace(rowHeight);
      const rowTop = this.y;
      for (let c = 0; c < columns; c++) {
        const item = filtered[r * columns + c];
        if (!item) continue;
        const x = MARGIN.left + c * colWidth;
        this.doc
          .fillColor(COLOURS.faint)
          .font('Helvetica')
          .fontSize(7.5)
          .text(item.label.toUpperCase(), x, rowTop, { width: colWidth - 12, characterSpacing: 0.4 });
        this.doc
          .fillColor(COLOURS.ink)
          .font('Helvetica-Bold')
          .fontSize(9.5)
          .text(String(item.value), x, rowTop + 10, { width: colWidth - 12, lineBreak: false, ellipsis: true });
      }
      this.y = rowTop + rowHeight;
    }
    this.y += 2;
  }

  /**
   * Table with manual pagination. The header row is redrawn on every page so a
   * multi-page invoice stays readable, and rows never overflow the bottom
   * margin.
   */
  table(opts: { columns: Column[]; rows: any[]; footRows?: string[][]; emptyText?: string }) {
    const { columns, rows } = opts;
    const totalFraction = columns.reduce((a, c) => a + c.width, 0) || 1;
    const widths = columns.map((c) => (c.width / totalFraction) * CONTENT_WIDTH);
    const xs: number[] = [];
    let acc = MARGIN.left;
    for (const w of widths) {
      xs.push(acc);
      acc += w;
    }
    const rowPad = 5;

    // Measure the header rather than assuming one line. A wrapped header on a
    // fixed-height band overlaps the first row.
    const headerLabels = columns.map((c) => c.header.toUpperCase());
    this.doc.font('Helvetica-Bold').fontSize(8);
    const headerHeight =
      Math.max(
        ...headerLabels.map((t, i) => this.doc.heightOfString(t, { width: widths[i] - 10, characterSpacing: 0.4 })),
        9,
      ) + 10;

    const drawHeaderRow = () => {
      this.doc.rect(MARGIN.left, this.y, CONTENT_WIDTH, headerHeight).fill(COLOURS.brand);
      this.doc.fillColor(COLOURS.white).font('Helvetica-Bold').fontSize(8);
      columns.forEach((c, i) => {
        this.doc.text(headerLabels[i], xs[i] + 5, this.y + 5, {
          width: widths[i] - 10,
          align: c.align ?? 'left',
          characterSpacing: 0.4,
          // Bound the box. Without an explicit height PDFKit paginates the text
          // itself, silently adding pages mid-table and desynchronising the
          // cursor from the real page.
          height: headerHeight,
        });
      });
      this.y += headerHeight;
    };

    const drawRow = (row: any, index: number) => {
      // Measure first, then decide whether it fits, so a row is never split.
      this.doc.font('Helvetica').fontSize(9);
      const cellTexts = columns.map((c) =>
        c.render ? c.render(row, index) : c.key ? String(row[c.key] ?? '') : '',
      );
      const heights = cellTexts.map((t, i) =>
        this.doc.heightOfString(t, { width: widths[i] - 10, lineGap: 1 }),
      );
      const rowHeight = Math.max(...heights, 10) + rowPad * 2;

      if (this.y + rowHeight > PAGE.height - MARGIN.bottom) {
        this.doc.addPage();
        this.y = this.pageTop();
        this.drawContinuation();
        drawHeaderRow();
      }

      if (index % 2 === 1) {
        this.doc.rect(MARGIN.left, this.y, CONTENT_WIDTH, rowHeight).fill(COLOURS.surface);
      }
      columns.forEach((c, i) => {
        this.doc
          .fillColor(c.align === 'right' ? COLOURS.ink : COLOURS.body)
          .font(c.align === 'right' ? 'Helvetica-Bold' : 'Helvetica')
          .fontSize(9)
          .text(cellTexts[i], xs[i] + 5, this.y + rowPad, {
            width: widths[i] - 10,
            align: c.align ?? 'left',
            lineGap: 1,
            // Same reason as the header: never let a cell trigger its own page.
            height: rowHeight,
          });
      });
      this.doc
        .moveTo(MARGIN.left, this.y + rowHeight)
        .lineTo(MARGIN.left + CONTENT_WIDTH, this.y + rowHeight)
        .lineWidth(0.4)
        .strokeColor(COLOURS.rule)
        .stroke();
      this.y += rowHeight;
    };

    this.ensureSpace(headerHeight + 24);
    drawHeaderRow();

    if (!rows.length) {
      this.doc
        .fillColor(COLOURS.faint)
        .font('Helvetica-Oblique')
        .fontSize(9)
        .text(opts.emptyText ?? 'No items.', MARGIN.left + 5, this.y + 7);
      this.y += 24;
    } else {
      rows.forEach(drawRow);
    }

    // Totals band, right aligned under the last column.
    if (opts.footRows?.length) {
      for (const cells of opts.footRows) {
        this.ensureSpace(18);
        const label = cells[0];
        const value = cells[1];
        this.doc.rect(MARGIN.left, this.y, CONTENT_WIDTH, 18).fill(COLOURS.brandLight);
        this.doc.fillColor(COLOURS.brand).font('Helvetica-Bold').fontSize(9);
        this.doc.text(label, MARGIN.left + 8, this.y + 5, { width: CONTENT_WIDTH - 160, align: 'right' });
        this.doc.text(value, MARGIN.left, this.y + 5, { width: CONTENT_WIDTH - 8, align: 'right' });
        this.y += 18;
      }
    }
    this.y += 10;
  }

  /** Highlighted note. `tone` maps to a colour so warnings are visually distinct. */
  note(text: string, tone: 'info' | 'warn' | 'muted' = 'info') {
    const palette = {
      info: { bg: '#f0f4ef', border: COLOURS.brandMid, text: COLOURS.brand },
      warn: { bg: '#fdf6ec', border: COLOURS.copper, text: '#8f5f38' },
      muted: { bg: COLOURS.surface, border: COLOURS.rule, text: COLOURS.muted },
    }[tone];

    this.doc.font('Helvetica').fontSize(9);
    const inner = CONTENT_WIDTH - 24;
    const h = this.doc.heightOfString(text, { width: inner, lineGap: 2 }) + 16;
    this.ensureSpace(h + 8);
    this.doc.rect(MARGIN.left, this.y, CONTENT_WIDTH, h).fill(palette.bg);
    this.doc.rect(MARGIN.left, this.y, 3, h).fill(palette.border);
    this.doc.fillColor(palette.text).text(text, MARGIN.left + 12, this.y + 8, { width: inner, lineGap: 2 });
    this.y += h + 8;
  }

  /** Declaration and signature band for binding documents. */
  signatureBlock(opts: { declaration?: string; labels: string[] }) {
    if (opts.declaration) {
      this.ensureSpace(40);
      this.paragraph(opts.declaration, { size: 8.5, colour: COLOURS.muted });
      this.space(6);
    }
    const count = opts.labels.length;
    const colWidth = CONTENT_WIDTH / count;
    const blockHeight = 58;
    this.ensureSpace(blockHeight + 10);
    const top = this.y;
    opts.labels.forEach((label, i) => {
      const x = MARGIN.left + i * colWidth;
      this.doc
        .moveTo(x, top + 34)
        .lineTo(x + colWidth - 24, top + 34)
        .lineWidth(0.8)
        .strokeColor(COLOURS.muted)
        .stroke();
      this.doc.fillColor(COLOURS.muted).font('Helvetica').fontSize(8).text(label, x, top + 38, { width: colWidth - 24 });
    });
    this.y = top + blockHeight;
  }

  /**
   * Stamp footers across every buffered page, then finalise.
   *
   * Called once at the end: PDFKit only knows the page count after all content
   * has been laid out, so footers cannot be written inline.
   */
  async toBuffer(): Promise<Buffer> {
    const range = this.doc.bufferedPageRange();
    const total = range.count;
    for (let i = 0; i < total; i++) {
      this.doc.switchToPage(range.start + i);
      const y = PAGE.height - MARGIN.bottom + 18;
      this.doc
        .moveTo(MARGIN.left, y - 8)
        .lineTo(MARGIN.left + CONTENT_WIDTH, y - 8)
        .lineWidth(0.5)
        .strokeColor(COLOURS.rule)
        .stroke();
    this.doc
      .fillColor(COLOURS.faint)
      .font('Helvetica')
      .fontSize(7.5)
      .text(this.footerNote || this.meta.company.name, MARGIN.left, y, {
        width: CONTENT_WIDTH * 0.7,
        lineBreak: false,
        height: 12,
      });
      this.doc
        .fillColor(COLOURS.faint)
        .font('Helvetica')
        .fontSize(7.5)
        .text(`Page ${i + 1} of ${total}`, MARGIN.left, y, {
          width: CONTENT_WIDTH,
          align: 'right',
          lineBreak: false,
          height: 12,
        });
    }

    return new Promise<Buffer>((resolve, reject) => {
      const chunks: Buffer[] = [];
      this.doc.on('data', (c: Buffer) => chunks.push(c));
      this.doc.on('end', () => resolve(Buffer.concat(chunks)));
      this.doc.on('error', reject);
      this.doc.end();
    });
  }
}

// ── shared formatting ──────────────────────────────────────────────────

export function money(amount: unknown, currency = 'USD'): string {
  const n = Number(amount ?? 0);
  if (!Number.isFinite(n)) return '—';
  const symbols: Record<string, string> = { USD: '$', EUR: '€', GBP: '£', ETB: 'Br' };
  const sym = symbols[currency];
  const formatted = n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return sym ? `${sym}${formatted}` : `${formatted} ${currency}`;
}

export function kg(value: unknown, dp = 2): string {
  const n = Number(value ?? 0);
  if (!Number.isFinite(n)) return '—';
  return `${n.toLocaleString('en-US', { minimumFractionDigits: dp, maximumFractionDigits: dp })} kg`;
}

/**
 * Plain grouped number, no unit.
 *
 * Table cells get the bare figure and the column header carries the unit, so a
 * narrow column does not have to fit "1,440.00 kg" and wrap onto two lines.
 */
export function num(value: unknown, dp = 2): string {
  // A missing figure must read as missing. Formatting null as "0.00" on a
  // customs document states a weight that was never recorded.
  if (value === null || value === undefined || value === '') return '—';
  const n = Number(value);
  if (!Number.isFinite(n)) return '—';
  return n.toLocaleString('en-US', { minimumFractionDigits: dp, maximumFractionDigits: dp });
}

export function dateLong(d: Date | string | null | undefined): string {
  if (!d) return '—';
  const date = new Date(d);
  if (Number.isNaN(date.getTime())) return '—';
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${String(date.getDate()).padStart(2, '0')} ${months[date.getMonth()]} ${date.getFullYear()}`;
}
