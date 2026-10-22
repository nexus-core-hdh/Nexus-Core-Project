import { Injectable, Logger } from '@nestjs/common';
import * as nodemailer from 'nodemailer';
import { PrismaService } from '../../prisma/prisma.service';
import { smtpTransportFromEnv } from './smtp-env';

interface Transport {
  transporter: nodemailer.Transporter;
  from: string;
  source: string;
}

/**
 * Outgoing mail for authentication flows. Uses the company's active SMTP configuration from the
 * existing SmtpSetting table (Communication -> SMTP settings; the default one first), falling back
 * to SMTP_HOST/SMTP_PORT/SMTP_SECURE/SMTP_USER/SMTP_PASS/SMTP_FROM. Never logs message bodies,
 * links or tokens.
 */
@Injectable()
export class MailService {
  private readonly logger = new Logger('[NexusCore] MailService');

  constructor(private readonly prisma: PrismaService) {}

  private async transportFor(companyId?: string | null): Promise<Transport | null> {
    const setting = companyId
      ? await this.prisma.smtpSetting.findFirst({
          where: { companyId, isActive: true },
          orderBy: [{ isDefault: 'desc' }, { updatedAt: 'desc' }],
        })
      : null;
    if (setting) {
      return {
        transporter: nodemailer.createTransport({
          host: setting.host,
          port: setting.port,
          secure: setting.secure,
          auth: setting.username ? { user: setting.username, pass: setting.password } : undefined,
        }),
        from: setting.fromName ? `"${setting.fromName}" <${setting.fromEmail}>` : setting.fromEmail,
        source: `SmtpSetting "${setting.name}"`,
      };
    }
    // SMTP_* environment (smtp-env.ts — the same settings `npm run smtp:verify` checks).
    const env = smtpTransportFromEnv();
    if (!env) return null;
    return { transporter: nodemailer.createTransport(env.options), from: env.from, source: env.source };
  }

  /** Whether a transport exists for this company (its SmtpSetting or the SMTP_* environment) — lets
   *  a caller refuse up front instead of creating records for an email that cannot be sent. */
  async isConfigured(companyId?: string | null): Promise<boolean> {
    return !!(await this.transportFor(companyId));
  }

  /** Sends a message; returns false (and logs why, without content) when it could not be sent. */
  async send(to: string, subject: string, text: string, html: string, companyId?: string | null): Promise<boolean> {
    const transport = await this.transportFor(companyId);
    if (!transport) {
      this.logger.warn(`No mail transport configured (no active SmtpSetting and no SMTP_HOST) — "${subject}" was not sent.`);
      return false;
    }
    try {
      await transport.transporter.sendMail({ from: transport.from, to, subject, text, html });
      return true;
    } catch (e) {
      this.logger.error(`Sending "${subject}" via ${transport.source} failed: ${(e as Error).message}`);
      return false;
    }
  }
}
