import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Outbound email. Uses Gmail/SMTP when credentials are configured; otherwise the
 * message is logged and recorded with status "Queued" so nothing is lost.
 */
@Injectable()
export class EmailService {
  private logger = new Logger('Email');
  private transporter: any = null;

  constructor(private prisma: PrismaService) {
    this.init();
  }

  private init() {
    const user = process.env.GMAIL_USER;
    const pass = process.env.GMAIL_APP_PASSWORD;
    if (!user || !pass) return;
    try {
      // lazy require so the app runs even if nodemailer isn't installed
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const nodemailer = require('nodemailer');
      this.transporter = nodemailer.createTransport({
        service: process.env.MAIL_PROVIDER === 'gmail' ? 'gmail' : undefined,
        host: process.env.SMTP_HOST || undefined,
        port: process.env.SMTP_PORT ? Number(process.env.SMTP_PORT) : undefined,
        secure: false,
        auth: { user, pass },
      });
      this.logger.log('Email transport ready (SMTP configured)');
    } catch {
      this.logger.warn('nodemailer not available — emails will be queued, not sent');
    }
  }

  async send(params: {
    to: string;
    subject: string;
    html: string;
    text?: string;
    template?: string;
    entity?: string;
    entityId?: string;
    userId?: string;
  }) {
    const from = process.env.MAIL_FROM || process.env.GMAIL_USER || 'MADDA ERP <no-reply@madda.local>';
    let status = 'Queued';
    let error: string | undefined;
    let provider: string | undefined;
    if (this.transporter) {
      try {
        await this.transporter.sendMail({
          from,
          to: params.to,
          subject: params.subject,
          html: params.html,
          text: params.text,
        });
        status = 'Sent';
        provider = 'smtp';
      } catch (e: any) {
        status = 'Failed';
        error = e?.message ?? 'send failed';
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
