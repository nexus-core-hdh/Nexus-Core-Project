import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { createHash, randomBytes } from 'crypto';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../../prisma/prisma.service';
import { MailService } from './mail.service';

const TOKEN_TTL_MS = 30 * 60 * 1000;
const RESEND_COOLDOWN_MS = 60 * 1000;
export const MIN_PASSWORD_LENGTH = 8;
export const PASSWORD_RESET_GENERIC_MESSAGE =
  'If an account exists for that email address, a password reset link has been sent to it.';

const hashToken = (token: string) => createHash('sha256').update(token).digest('hex');

/**
 * Email-based password reset (frontend: /dashboard/forgot-password -> email link ->
 * /dashboard/reset-password?token=...). The raw token only ever exists in the emailed link: the
 * PasswordResetToken.token column stores its SHA-256 hash, and neither the API response nor the
 * logs contain it. The response is identical whether or not the email belongs to an account.
 */
@Injectable()
export class PasswordResetService {
  private readonly logger = new Logger('[NexusCore] PasswordReset');

  constructor(
    private readonly prisma: PrismaService,
    private readonly mail: MailService,
  ) {}

  async request(email: string): Promise<{ message: string }> {
    const normalized = (email ?? '').trim();
    if (normalized) {
      // Not awaited: the response must take the same time whether or not the account exists.
      this.issueAndSend(normalized).catch((e) => this.logger.error(`Password reset request failed: ${(e as Error).message}`));
    }
    return { message: PASSWORD_RESET_GENERIC_MESSAGE };
  }

  private async issueAndSend(email: string) {
    const user = await this.prisma.user.findFirst({
      where: { email: { equals: email, mode: 'insensitive' } },
      select: { id: true, email: true, name: true, isActive: true, companyId: true },
    });
    if (!user || !user.isActive) return;

    const recent = await this.prisma.passwordResetToken.findFirst({
      where: { userId: user.id, used: false, createdAt: { gt: new Date(Date.now() - RESEND_COOLDOWN_MS) } },
      select: { id: true },
    });
    if (recent) return; // one email per minute per account, whatever the caller's IP

    const token = randomBytes(32).toString('base64url');
    await this.prisma.$transaction([
      this.prisma.passwordResetToken.deleteMany({ where: { userId: user.id } }),
      this.prisma.passwordResetToken.create({
        data: { userId: user.id, token: hashToken(token), expiresAt: new Date(Date.now() + TOKEN_TTL_MS) },
      }),
    ]);

    const base = (process.env.APP_PUBLIC_URL || 'http://localhost:3000').replace(/\/+$/, '');
    const link = `${base}/dashboard/reset-password?token=${encodeURIComponent(token)}`;
    const minutes = TOKEN_TTL_MS / 60000;
    const sent = await this.mail.send(
      user.email,
      'Reset your password',
      `Hello ${user.name},\n\nUse this link to set a new password (valid for ${minutes} minutes, single use):\n${link}\n\nIf you did not request this, you can ignore this email.`,
      `<p>Hello ${escapeHtml(user.name)},</p><p>Use the link below to set a new password. It is valid for ${minutes} minutes and can be used once.</p><p><a href="${escapeHtml(link)}">Reset password</a></p><p>If you did not request this, you can ignore this email.</p>`,
      user.companyId,
    );
    if (!sent) this.logger.warn(`Password reset requested for user ${user.id} but the email could not be sent.`);
  }

  async reset(token: string, newPassword: string): Promise<{ message: string }> {
    if (!token || typeof token !== 'string') throw new BadRequestException('Invalid or expired reset link');
    if (!newPassword || newPassword.length < MIN_PASSWORD_LENGTH) {
      throw new BadRequestException(`Password must be at least ${MIN_PASSWORD_LENGTH} characters`);
    }
    const record = await this.prisma.passwordResetToken.findFirst({
      where: { token: hashToken(token), used: false, expiresAt: { gt: new Date() } },
      select: { id: true, userId: true },
    });
    if (!record) throw new BadRequestException('Invalid or expired reset link');

    const hashed = await bcrypt.hash(newPassword, 10);
    await this.prisma.$transaction([
      this.prisma.user.update({ where: { id: record.userId }, data: { password: hashed, mustChangePassword: false } }),
      // single use: this token and any other outstanding token for the user stop working
      this.prisma.passwordResetToken.updateMany({ where: { userId: record.userId }, data: { used: true } }),
    ]);
    return { message: 'Password has been reset. You can now sign in.' };
  }
}

function escapeHtml(s: string): string {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}
