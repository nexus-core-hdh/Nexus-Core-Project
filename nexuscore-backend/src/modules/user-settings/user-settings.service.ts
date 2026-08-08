import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import * as bcrypt from 'bcrypt';
import { v4 as uuidv4 } from 'uuid';

@Injectable()
export class UserSettingsService {
  constructor(private readonly prisma: PrismaService) {}

  async getSettings(userId: string) {
    const settings = await this.prisma.userSettings.findFirst({ where: { userId } });
    if (!settings) {
      return this.prisma.userSettings.create({ data: { userId } });
    }
    return settings;
  }

  async updateSettings(userId: string, dto: any) {
    // `tablePreferences` is a shared JSON blob — multiple independent features
    // (Workspace tabs, My Menu, and whatever future preference lands here) each
    // write only their own top-level key. A plain Prisma `update` would replace
    // the whole JSON value, so a Workspace-only write would silently wipe out
    // My Menu (and vice versa). Shallow-merge the incoming keys over whatever is
    // already stored instead of overwriting the field outright.
    if (dto.tablePreferences && typeof dto.tablePreferences === 'object') {
      const existing = await this.prisma.userSettings.findFirst({ where: { userId } });
      const existingPrefs = (existing?.tablePreferences as Record<string, any>) ?? {};
      dto = { ...dto, tablePreferences: { ...existingPrefs, ...dto.tablePreferences } };
    }

    return this.prisma.userSettings.upsert({
      where: { userId },
      create: { ...dto, userId },
      update: dto,
    });
  }

  async createPasswordResetToken(email: string) {
    const user = await this.prisma.user.findUnique({ where: { email } });
    if (!user) return { message: 'If the email exists, a reset link has been sent' };

    const token = uuidv4();
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000);

    await this.prisma.passwordResetToken.deleteMany({ where: { userId: user.id } });
    await this.prisma.passwordResetToken.create({
      data: { userId: user.id, token, expiresAt },
    });

    return { token, email: user.email };
  }

  async consumePasswordResetToken(token: string, newPassword: string) {
    const record = await this.prisma.passwordResetToken.findFirst({
      where: { token, expiresAt: { gt: new Date() }, used: false },
      include: { user: true },
    });

    if (!record) throw new Error('Invalid or expired token');

    const hashedPassword = await bcrypt.hash(newPassword, 12);
    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: record.userId },
        data: { password: hashedPassword, mustChangePassword: false },
      }),
      this.prisma.passwordResetToken.update({
        where: { id: record.id },
        data: { used: true },
      }),
    ]);

    return { success: true };
  }

  async getNotificationPreferences(userId: string) {
    return this.prisma.userSettings.findFirst({
      where: { userId },
      select: {
        mobileNotifications: true,
        communicationEmails: true,
        socialEmails: true,
        marketingEmails: true,
        securityEmails: true,
        notificationType: true,
      },
    });
  }

  async updateProfile(userId: string, dto: any) {
    const { name, phone, country, location, department, image } = dto;
    return this.prisma.user.update({
      where: { id: userId },
      data: { name, phone, country, location, department, image },
      select: { id: true, name: true, email: true, phone: true, country: true, location: true, department: true, image: true },
    });
  }
}
