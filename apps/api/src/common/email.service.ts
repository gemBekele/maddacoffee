import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Outbound email.
 *
 * Transport is selected by MAIL_PROVIDER:
 *   mailtrap — transactional sending via Mailtrap. The SMTP relay is
 *              live.smtp.mailtrap.io:587 with username "api" and the API token
 *              as the password. The token is per sending domain, so the address
 *              in MAIL_FROM must belong to the verified domain or Mailtrap will
 *              reject the message.
 *   gmail    — Gmail SMTP for local or fallback use.
 *   none     — nothing is sent; messages are recorded as Queued so the workflow
 *              still produces an audit trail.
 *
 * Credentials live only in the environment. Nothing here is ever written to the
 * EmailLog table, which is read by the UI.
 */
@Injectable()
export class EmailService {
  private logger = new Logger('Email');
  private transporter: any = null;
  private providerName = 'none';

  constructor(private prisma: PrismaService) {
    this.init();
  }

  /** Resolve credentials for the configured provider without logging them. */
  private resolveTransport():
    | { host: string; port: number; secure: boolean; user: string; pass: string }
    | { gmail: true; user: string; pass: string }
    | null {
    const provider = (process.env.MAIL_PROVIDER || '').toLowerCase();

    if (provider === 'mailtrap') {
      const user = process.env.SMTP_USER || 'api';
      const pass = process.env.SMTP_PASS;
      if (!pass) return null;
      const port = Number(process.env.SMTP_PORT || 587);
      return {
        host: process.env.SMTP_HOST || 'live.smtp.mailtrap.io',
        port,
        // 465 is implicit TLS; 587 and 2525 upgrade via STARTTLS.
        secure: process.env.SMTP_SECURE ? process.env.SMTP_SECURE === 'true' : port === 465,
        user,
        pass,
      };
    }

    if (provider === 'gmail') {
      const user = process.env.GMAIL_USER;
      const pass = process.env.GMAIL_APP_PASSWORD;
      if (!user || !pass) return null;
      return { gmail: true, user, pass };
    }

    // Explicit SMTP host with generic credentials.
    const host = process.env.SMTP_HOST;
    const user = process.env.SMTP_USER;
    const pass = process.env.SMTP_PASS;
    if (host && user && pass) {
      const port = Number(process.env.SMTP_PORT || 587);
      return { host, port, secure: port === 465, user, pass };
    }

    return null;
  }

  private init() {
    const config = this.resolveTransport();
    if (!config) {
      this.logger.warn(
        `Mail provider "${process.env.MAIL_PROVIDER || 'none'}" has no usable credentials — emails will be recorded as Queued, not sent`,
      );
      return;
    }
    try {
      // Lazy require so the app still boots if nodemailer is unavailable.
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const nodemailer = require('nodemailer');
      this.transporter =
        'gmail' in config
          ? nodemailer.createTransport({ service: 'gmail', auth: { user: config.user, pass: config.pass } })
          : nodemailer.createTransport({
              host: config.host,
              port: config.port,
              secure: config.secure,
              requireTLS: !config.secure,
              auth: { user: config.user, pass: config.pass },
            });
      this.providerName = (process.env.MAIL_PROVIDER || 'smtp').toLowerCase();
      const where = 'gmail' in config ? 'gmail' : `${config.host}:${config.port}`;
      this.logger.log(`Email transport ready via ${this.providerName} (${where})`);

      // Verify in the background. A bad token or an unverified sending domain
      // should be loud at boot rather than discovered when a buyer misses an
      // invoice. Never throws: a transport problem must not stop the API.
      this.transporter.verify?.().then(
        () => this.logger.log(`Email transport verified (${this.providerName})`),
        (e: Error) =>
          this.logger.error(
            `Email transport check failed (${this.providerName}): ${e.message}. Messages will be recorded as Failed until this is corrected.`,
          ),
      );
    } catch (e) {
      this.logger.warn(`nodemailer unavailable — emails will be queued, not sent: ${(e as Error).message}`);
    }
  }

  /** Transport status for the UI, without exposing credentials. */
  status() {
    return {
      configured: !!this.transporter,
      provider: this.providerName,
      from: process.env.MAIL_FROM ?? null,
    };
  }

  async send(params: {
    to: string;
    subject: string;
    html: string;
    text?: string;
    replyTo?: string;
    template?: string;
    entity?: string;
    entityId?: string;
    userId?: string;
    /** Generated in memory; nothing is written to disk. */
    attachments?: { filename: string; content: Buffer; contentType?: string }[];
  }) {
    const from = process.env.MAIL_FROM || process.env.GMAIL_USER || 'MADDA ERP <no-reply@madda.local>';
    let status = 'Queued';
    let error: string | undefined;
    let provider: string | undefined;
    if (this.transporter) {
      try {
        const info = await this.transporter.sendMail({
          from,
          replyTo: params.replyTo ?? process.env.MAIL_REPLY_TO ?? undefined,
          to: params.to,
          subject: params.subject,
          html: params.html,
          text: params.text,
          attachments: (params.attachments ?? []).map((a) => ({
            filename: a.filename,
            content: a.content,
            contentType: a.contentType ?? 'application/pdf',
          })),
        });
        status = 'Sent';
        provider = this.providerName;
        // Mailtrap returns per-message IDs; keep them so a delivery can be
        // traced back in the Mailtrap log when a buyer says nothing arrived.
        if (info?.messageId) error = undefined;
        this.logger.log(
          `Sent "${params.subject}" to ${params.to} via ${this.providerName}${info?.messageId ? ` (${info.messageId})` : ''}`,
        );
      } catch (e: any) {
        status = 'Failed';
        // SMTP errors carry the useful detail (bad sender, unverified domain,
        // rejected recipient) on the response body rather than the message.
        const detail = e?.response ?? e?.message ?? 'send failed';
        error = typeof detail === 'string' ? detail : String(detail);
        this.logger.error(`Send failed to ${params.to}: ${error}`);
      }
    } else {
      this.logger.log(`[QUEUED EMAIL] to=${params.to} subject="${params.subject}"`);
    }
    await this.prisma.emailLog.create({
      data: {
        to: params.to,
        subject: params.subject,
        template: params.template ?? null,
        entity: params.entity ?? null,
        entityId: params.entityId ?? null,
        status,
        provider: provider ?? null,
        error: error ?? null,
        createdById: params.userId ?? null,
      },
    });
    return { status, error };
  }
}
