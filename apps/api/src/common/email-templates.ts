/**
 * HTML email templates.
 *
 * Email clients are not browsers: Outlook and Gmail strip <style> blocks
 * inconsistently, drop flexbox and grid, and ignore most shorthand CSS. So the
 * layout is table-based with inline styles, and the single <style> block only
 * carries progressive enhancements (hover, dark mode, small screens) that
 * degrade harmlessly.
 *
 * The palette matches the web app so a buyer sees one consistent brand.
 */

export const BRAND = {
  green: '#2a3f26',
  greenMid: '#4c6b46',
  greenSoft: '#f2f6f1',
  copper: '#ad7846',
  copperSoft: '#fbf5ee',
  ink: '#1f2937',
  body: '#374151',
  muted: '#6b7280',
  faint: '#9ca3af',
  rule: '#e5e7eb',
  surface: '#f9fafb',
  warnBg: '#fef3c7',
  warnText: '#92400e',
} as const;

export interface CompanyInfo {
  name: string;
  email?: string | null;
  phone?: string | null;
  address?: string | null;
}

function escapeHtml(s: unknown): string {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** Bulletproof CTA: a VML fallback for Outlook, an anchor for everyone else. */
export function button(url: string, label: string): string {
  return `
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:24px 0 8px;">
    <tr>
      <td align="center" bgcolor="${BRAND.green}" style="border-radius:6px;">
        <a href="${escapeHtml(url)}"
           style="display:inline-block;padding:13px 28px;font-family:Arial,Helvetica,sans-serif;font-size:14px;
                  font-weight:bold;color:#ffffff;text-decoration:none;border-radius:6px;letter-spacing:0.2px;">
          ${escapeHtml(label)}
        </a>
      </td>
    </tr>
  </table>`;
}

/** Label/value rows, used for the summary block. */
export function infoTable(rows: { label: string; value: string }[]): string {
  const body = rows
    .filter((r) => r.value)
    .map(
      (r) => `
      <tr>
        <td style="padding:7px 0;font-family:Arial,Helvetica,sans-serif;font-size:13px;color:${BRAND.muted};width:42%;vertical-align:top;">
          ${escapeHtml(r.label)}
        </td>
        <td style="padding:7px 0;font-family:Arial,Helvetica,sans-serif;font-size:13px;color:${BRAND.ink};font-weight:bold;vertical-align:top;">
          ${escapeHtml(r.value)}
        </td>
      </tr>`,
    )
    .join('');
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%"
     style="border-collapse:collapse;border-top:1px solid ${BRAND.rule};">${body}</table>`;
}

/** Line items for an invoice or proforma. */
export function lineTable(
  lines: { description: string; lotId?: string | null; quantity: string; unit: string; amount: string }[],
  total: { label: string; value: string }[],
): string {
  const head = `
    <tr>
      <th align="left" style="padding:9px 10px;font-family:Arial,Helvetica,sans-serif;font-size:11px;letter-spacing:0.5px;text-transform:uppercase;color:#ffffff;background:${BRAND.green};">Description</th>
      <th align="right" style="padding:9px 10px;font-family:Arial,Helvetica,sans-serif;font-size:11px;letter-spacing:0.5px;text-transform:uppercase;color:#ffffff;background:${BRAND.green};">Qty</th>
      <th align="right" style="padding:9px 10px;font-family:Arial,Helvetica,sans-serif;font-size:11px;letter-spacing:0.5px;text-transform:uppercase;color:#ffffff;background:${BRAND.green};">Unit</th>
      <th align="right" style="padding:9px 10px;font-family:Arial,Helvetica,sans-serif;font-size:11px;letter-spacing:0.5px;text-transform:uppercase;color:#ffffff;background:${BRAND.green};">Amount</th>
    </tr>`;

  const rows = lines
    .map(
      (l, i) => `
    <tr style="background:${i % 2 ? BRAND.surface : '#ffffff'};">
      <td style="padding:9px 10px;font-family:Arial,Helvetica,sans-serif;font-size:13px;color:${BRAND.body};border-bottom:1px solid ${BRAND.rule};">
        ${escapeHtml(l.description)}${l.lotId ? `<br><span style="font-size:11px;color:${BRAND.faint};">${escapeHtml(l.lotId)}</span>` : ''}
      </td>
      <td align="right" style="padding:9px 10px;font-family:Arial,Helvetica,sans-serif;font-size:13px;color:${BRAND.body};border-bottom:1px solid ${BRAND.rule};white-space:nowrap;">${escapeHtml(l.quantity)}</td>
      <td align="right" style="padding:9px 10px;font-family:Arial,Helvetica,sans-serif;font-size:13px;color:${BRAND.body};border-bottom:1px solid ${BRAND.rule};white-space:nowrap;">${escapeHtml(l.unit)}</td>
      <td align="right" style="padding:9px 10px;font-family:Arial,Helvetica,sans-serif;font-size:13px;color:${BRAND.ink};font-weight:bold;border-bottom:1px solid ${BRAND.rule};white-space:nowrap;">${escapeHtml(l.amount)}</td>
    </tr>`,
    )
    .join('');

  const feet = total
    .map(
      (t) => `
    <tr>
      <td colspan="3" align="right" style="padding:8px 10px;font-family:Arial,Helvetica,sans-serif;font-size:12px;color:${BRAND.muted};background:${BRAND.greenSoft};white-space:nowrap;">${escapeHtml(t.label)}</td>
      <td align="right" style="padding:8px 10px;font-family:Arial,Helvetica,sans-serif;font-size:13px;font-weight:bold;color:${BRAND.green};background:${BRAND.greenSoft};white-space:nowrap;">${escapeHtml(t.value)}</td>
    </tr>`,
    )
    .join('');

  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%"
      style="border-collapse:collapse;border:1px solid ${BRAND.rule};border-radius:6px;overflow:hidden;">
    ${head}${rows}${feet}
  </table>`;
}

/** A callout used for the "what is attached" note and for warnings. */
export function callout(text: string, tone: 'info' | 'warn' | 'muted' = 'info'): string {
  const c = {
    info: { bg: BRAND.greenSoft, border: BRAND.greenMid, text: BRAND.green },
    warn: { bg: BRAND.warnBg, border: BRAND.copper, text: BRAND.warnText },
    muted: { bg: BRAND.surface, border: BRAND.rule, text: BRAND.muted },
  }[tone];
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%"
      style="margin:16px 0;border-collapse:separate;background:${c.bg};border-radius:6px;">
    <tr>
      <td style="padding:12px 14px;border-left:3px solid ${c.border};font-family:Arial,Helvetica,sans-serif;font-size:13px;line-height:1.5;color:${c.text};">
        ${text}
      </td>
    </tr>
  </table>`;
}

export interface LayoutOptions {
  preheader: string;
  heading: string;
  subheading?: string;
  body: string;
  company: CompanyInfo;
  footerNote?: string;
}

/**
 * Base layout.
 *
 * The preheader is the grey text a client shows next to the subject in the
 * inbox list. Without one, clients scrape the first line of the body, which
 * usually looks like an accident.
 */
export function layout(opts: LayoutOptions): string {
  const company = opts.company;
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="x-apple-disable-message-reformatting">
<meta name="color-scheme" content="light dark">
<title>${escapeHtml(opts.heading)}</title>
<style>
  /* Progressive enhancement only. The layout works without any of this. */
  body { margin:0 !important; padding:0 !important; width:100% !important; }
  table { border-collapse:collapse; }
  a { color:${BRAND.greenMid}; }
  @media screen and (max-width:600px) {
    .wrap { width:100% !important; }
    .px { padding-left:18px !important; padding-right:18px !important; }
    .stack { display:block !important; width:100% !important; }
  }
  @media (prefers-color-scheme: dark) {
    .card { background:#1b1f1a !important; }
    .body-text { color:#e5e7eb !important; }
  }
</style>
</head>
<body style="margin:0;padding:0;background:${BRAND.surface};">
<div style="display:none;font-size:1px;color:${BRAND.surface};line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;">
  ${escapeHtml(opts.preheader)}
</div>

<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background:${BRAND.surface};">
  <tr>
    <td align="center" style="padding:24px 12px;">

      <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="600" class="wrap" style="width:600px;max-width:600px;">

        <tr>
          <td class="px" style="padding:0 0 16px 0;">
            <span style="font-family:Arial,Helvetica,sans-serif;font-size:16px;font-weight:bold;color:${BRAND.green};letter-spacing:0.2px;">
              ${escapeHtml(company.name)}
            </span>
            <span style="font-family:Arial,Helvetica,sans-serif;font-size:11px;color:${BRAND.copper};text-transform:uppercase;letter-spacing:1px;float:right;padding-top:3px;">
              Ethiopian coffee export
            </span>
          </td>
        </tr>

        <tr>
          <td class="card px" style="background:#ffffff;border-radius:10px;border:1px solid ${BRAND.rule};padding:30px;">

            <h1 style="margin:0 0 4px;font-family:Arial,Helvetica,sans-serif;font-size:20px;line-height:1.3;color:${BRAND.green};">
              ${escapeHtml(opts.heading)}
            </h1>
            ${opts.subheading ? `<p style="margin:0 0 18px;font-family:Arial,Helvetica,sans-serif;font-size:13px;color:${BRAND.copper};font-weight:bold;">${escapeHtml(opts.subheading)}</p>` : ''}

            <div class="body-text" style="font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.6;color:${BRAND.body};">
              ${opts.body}
            </div>

          </td>
        </tr>

        <tr>
          <td class="px" style="padding:18px 0 0;">
            <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
              <tr>
                <td style="font-family:Arial,Helvetica,sans-serif;font-size:12px;line-height:1.6;color:${BRAND.faint};">
                  ${opts.footerNote ? `<p style="margin:0 0 8px;color:${BRAND.muted};">${escapeHtml(opts.footerNote)}</p>` : ''}
                  <p style="margin:0;font-weight:bold;color:${BRAND.muted};">${escapeHtml(company.name)}</p>
                  ${company.address ? `<p style="margin:2px 0 0;">${escapeHtml(company.address)}</p>` : ''}
                  ${company.email ? `<p style="margin:2px 0 0;">${escapeHtml(company.email)}</p>` : ''}
                  ${company.phone ? `<p style="margin:2px 0 0;">${escapeHtml(company.phone)}</p>` : ''}
                  <p style="margin:10px 0 0;">Sent by Ancient Halo Coffee on behalf of ${escapeHtml(company.name)}.</p>
                </td>
              </tr>
            </table>
          </td>
        </tr>

      </table>
    </td>
  </tr>
</table>
</body>
</html>`;
}

// ── concrete templates ─────────────────────────────────────────────────

export function proformaEmail(p: {
  company: CompanyInfo;
  buyerName: string;
  code: string;
  date: string;
  incoterm: string;
  currency: string;
  validUntil?: string | null;
  lines: { description: string; lotId?: string | null; quantity: string; unit: string; amount: string }[];
  totals: { label: string; value: string }[];
  attachments: string[];
}): { subject: string; html: string; text: string } {
  const body = `
    <p style="margin:0 0 16px;">Dear ${escapeHtml(p.buyerName)},</p>
    <p style="margin:0 0 8px;">Thank you for your enquiry. Please find our proforma invoice
       <b>${escapeHtml(p.code)}</b> below, dated ${escapeHtml(p.date)}.</p>
    ${infoTable([
      { label: 'Proforma no.', value: p.code },
      { label: 'Date', value: p.date },
      { label: 'Incoterm', value: p.incoterm },
      { label: 'Currency', value: p.currency },
      { label: 'Valid until', value: p.validUntil ?? '' },
    ])}
    <div style="height:18px;"></div>
    ${lineTable(p.lines, p.totals)}
    ${callout(
      p.attachments.length
        ? `Attached: ${p.attachments.map(escapeHtml).join(', ')}.`
        : 'The proforma invoice is attached as a PDF.',
    )}
    ${callout(
      'This proforma invoice is a non-binding estimate issued for your review and for bank reference. ' +
        'Quantities and prices are confirmed by the sales contract and the subsequent commercial invoice.',
      'warn',
    )}
    <p style="margin:16px 0 0;">We are happy to answer any questions or arrange samples.</p>
    <p style="margin:16px 0 0;">Kind regards,<br><b>${escapeHtml(p.company.name)}</b></p>`;

  return {
    subject: `Proforma Invoice ${p.code} — ${p.company.name}`,
    html: layout({
      preheader: `Proforma invoice ${p.code} attached as PDF. Valid until ${p.validUntil ?? 'as stated'}.`,
      heading: 'Proforma Invoice',
      subheading: p.code,
      body,
      company: p.company,
      footerNote: 'This proforma invoice is a non-binding estimate and does not constitute an offer.',
    }),
    text: `Dear ${p.buyerName},\n\nPlease find proforma invoice ${p.code} dated ${p.date}, ${p.incoterm}, ${p.currency}.\n${p.totals.map((t) => `${t.label}: ${t.value}`).join('\n')}\n\nAttached: ${p.attachments.join(', ')}\n\nThis proforma invoice is a non-binding estimate.\n\nKind regards,\n${p.company.name}`,
  };
}

export function commercialInvoiceEmail(p: {
  company: CompanyInfo;
  buyerName: string;
  code: string;
  date: string;
  incoterm: string;
  currency: string;
  hsCode?: string | null;
  destination?: string | null;
  lines: { description: string; lotId?: string | null; quantity: string; unit: string; amount: string }[];
  totals: { label: string; value: string }[];
  attachments: string[];
}): { subject: string; html: string; text: string } {
  const body = `
    <p style="margin:0 0 16px;">Dear ${escapeHtml(p.buyerName)},</p>
    <p style="margin:0 0 8px;">Please find our commercial invoice <b>${escapeHtml(p.code)}</b> for the consignment,
       together with the export documents listed below.</p>
    ${infoTable([
      { label: 'Invoice no.', value: p.code },
      { label: 'Date', value: p.date },
      { label: 'Incoterm', value: p.incoterm },
      { label: 'HS code', value: p.hsCode ?? '' },
      { label: 'Destination', value: p.destination ?? '' },
      { label: 'Currency', value: p.currency },
    ])}
    <div style="height:18px;"></div>
    ${lineTable(p.lines, p.totals)}
    ${callout(
      `Attached PDF documents:<br>${p.attachments.map((a) => `&bull; ${escapeHtml(a)}`).join('<br>')}`,
    )}
    <p style="margin:16px 0 0;">Documents that are issued by a government authority are supplied separately once issued.
       Please confirm receipt and let us know if your customs broker or bank requires anything further.</p>
    <p style="margin:16px 0 0;">Kind regards,<br><b>${escapeHtml(p.company.name)}</b></p>`;

  return {
    subject: `Commercial Invoice ${p.code} — ${p.company.name}`,
    html: layout({
      preheader: `Commercial invoice ${p.code} and export documents attached as PDF.`,
      heading: 'Commercial Invoice',
      subheading: p.code,
      body,
      company: p.company,
      footerNote: 'This invoice is issued for customs valuation and payment and is legally binding.',
    }),
    text: `Dear ${p.buyerName},\n\nPlease find commercial invoice ${p.code} dated ${p.date}, ${p.incoterm}, HS ${p.hsCode}.\n${p.totals.map((t) => `${t.label}: ${t.value}`).join('\n')}\n\nAttached: ${p.attachments.join(', ')}\n\nKind regards,\n${p.company.name}`,
  };
}

export function paymentReminderEmail(p: {
  company: CompanyInfo;
  buyerName: string;
  code: string;
  amount: string;
  dueDate: string;
  daysOverdue?: number;
  attachments: string[];
}): { subject: string; html: string; text: string } {
  const overdue = (p.daysOverdue ?? 0) > 0;
  const body = `
    <p style="margin:0 0 16px;">Dear ${escapeHtml(p.buyerName)},</p>
    <p style="margin:0 0 8px;">${
      overdue
        ? `This is a reminder that payment for invoice <b>${escapeHtml(p.code)}</b> is ${p.daysOverdue} day(s) overdue.`
        : `This is a friendly reminder that payment for invoice <b>${escapeHtml(p.code)}</b> is due on ${escapeHtml(p.dueDate)}.`
    }</p>
    ${infoTable([
      { label: 'Invoice', value: p.code },
      { label: 'Amount due', value: p.amount },
      { label: 'Due date', value: p.dueDate },
    ])}
    ${callout(
      overdue
        ? 'If payment has already been made, please disregard this message and accept our thanks.'
        : 'Please arrange payment in line with the agreed terms.',
      overdue ? 'warn' : 'info',
    )}
    <p style="margin:16px 0 0;">A copy of the invoice is attached. If you need a statement of account, just ask.</p>
    <p style="margin:16px 0 0;">Kind regards,<br><b>${escapeHtml(p.company.name)}</b></p>`;

  return {
    subject: overdue
      ? `Payment reminder — invoice ${p.code} (overdue)`
      : `Payment reminder — invoice ${p.code}`,
    html: layout({
      preheader: `Payment of ${p.amount} for invoice ${p.code} is ${overdue ? 'overdue' : `due ${p.dueDate}`}.`,
      heading: overdue ? 'Payment overdue' : 'Payment reminder',
      subheading: p.code,
      body,
      company: p.company,
    }),
    text: `Dear ${p.buyerName},\n\nInvoice ${p.code}: ${p.amount}, due ${p.dueDate}.\n\nKind regards,\n${p.company.name}`,
  };
}

export function approvalRequestEmail(p: {
  company: CompanyInfo;
  recipientName: string;
  summary: string;
  entityLabel: string;
  amount?: string | null;
  requestedBy?: string | null;
  note?: string | null;
}): { subject: string; html: string; text: string } {
  const body = `
    <p style="margin:0 0 16px;">Dear ${escapeHtml(p.recipientName)},</p>
    <p style="margin:0 0 8px;">A ${escapeHtml(p.entityLabel)} is awaiting your approval.</p>
    ${infoTable([
      { label: 'Type', value: p.entityLabel },
      { label: 'Summary', value: p.summary },
      { label: 'Amount', value: p.amount ?? '' },
      { label: 'Requested by', value: p.requestedBy ?? '' },
    ])}
    ${p.note ? callout(escapeHtml(p.note), 'muted') : ''}
    <p style="margin:16px 0 0;">Open the Approvals page in Ancient Halo Coffee to approve or reject it.</p>
    <p style="margin:16px 0 0;">Kind regards,<br><b>${escapeHtml(p.company.name)}</b></p>`;

  return {
    subject: `Approval requested — ${p.entityLabel}`,
    html: layout({
      preheader: `${p.entityLabel} awaiting approval: ${p.summary}.`,
      heading: 'Approval requested',
      subheading: p.entityLabel,
      body,
      company: p.company,
    }),
    text: `Dear ${p.recipientName},\n\n${p.entityLabel} awaiting approval: ${p.summary}\n${p.amount ? `Amount: ${p.amount}\n` : ''}Requested by: ${p.requestedBy ?? '-'}\n\nKind regards,\n${p.company.name}`,
  };
}

export function testEmail(p: { company: CompanyInfo; transport: string; from: string }): {
  subject: string;
  html: string;
  text: string;
} {
  const body = `
    <p style="margin:0 0 16px;">This is a test message from Ancient Halo Coffee.</p>
    <p style="margin:0 0 8px;">If you are reading it, outbound email is working and the layout is rendering correctly.</p>
    ${infoTable([
      { label: 'Transport', value: p.transport },
      { label: 'Sending as', value: p.from },
      { label: 'Sent at', value: new Date().toUTCString() },
    ])}
    ${callout('Documents attached to real emails are generated from the consignment data, not stored files.', 'info')}
    <p style="margin:16px 0 0;">Kind regards,<br><b>${escapeHtml(p.company.name)}</b></p>`;

  return {
    subject: 'Ancient Halo Coffee email test',
    html: layout({
      preheader: 'Test message confirming outbound email is configured.',
      heading: 'Email test',
      subheading: p.transport,
      body,
      company: p.company,
    }),
    text: `Ancient Halo Coffee email test.\nTransport: ${p.transport}\nFrom: ${p.from}`,
  };
}
