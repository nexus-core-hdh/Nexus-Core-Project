// Company trial rules — one place for registration (CompanyProvisioningService), sign-in
// (AuthService) and every authenticated request (JwtStrategy).
//
//  * A trial company has subscriptionStatus 'Trial' and a trialEndDate (migration
//    20261020000000_company_type_and_trial_status). It stays 'Trial' after that date: it is never
//    converted to Free or a paid plan automatically, and no data is deleted.
//  * Dates are UTC: a trial chosen to end on 2026-11-19 ends at 2026-11-19T23:59:59.999Z; the
//    default length comes from the server setting COMPANY_TRIAL_DAYS (whole days, 1–365) — with no
//    setting there is no default and the registering administrator must pick the end date.
//  * Expired = status 'Trial' and trialEndDate <= now. Users of an expired-trial company cannot sign
//    in, refresh a session or call the API (403 TRIAL_EXPIRED). The platform-owner company is never
//    on trial, so platform administrators can still manage the company.
import { ForbiddenException } from '@nestjs/common';

export const MAX_TRIAL_DAYS = 365;

/** COMPANY_TRIAL_DAYS as whole days in 1..365, or null when unset or invalid (no invented default). */
export function trialDefaultDays(raw: string | undefined = process.env.COMPANY_TRIAL_DAYS): number | null {
  if (raw == null || raw.trim() === '') return null;
  const n = Number(raw.trim());
  return Number.isInteger(n) && n >= 1 && n <= MAX_TRIAL_DAYS ? n : null;
}

/** "YYYY-MM-DD" -> that day's last millisecond in UTC; null for anything that is not a real date. */
export function trialEndOfDay(dateOnly: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateOnly ?? '');
  if (!m) return null;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const end = new Date(Date.UTC(y, mo - 1, d, 23, 59, 59, 999));
  return end.getUTCFullYear() === y && end.getUTCMonth() === mo - 1 && end.getUTCDate() === d ? end : null;
}

/** The default trial end: the last millisecond (UTC) of the day `days` days after `start`. */
export function defaultTrialEnd(start: Date, days: number): Date {
  const d = new Date(start.getTime() + days * 86_400_000);
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 23, 59, 59, 999));
}

export interface TrialFields { subscriptionStatus?: string | null; trialEndDate?: Date | string | null; isPlatformOwner?: boolean | null }

export function isTrialExpired(c: TrialFields | null | undefined, now: Date = new Date()): boolean {
  if (!c || c.isPlatformOwner || c.subscriptionStatus !== 'Trial' || !c.trialEndDate) return false;
  return new Date(c.trialEndDate).getTime() <= now.getTime();
}

/** Throws 403 TRIAL_EXPIRED for a user of a company whose trial has ended. */
export function assertTrialNotExpired(c: TrialFields | null | undefined, now: Date = new Date()): void {
  if (!isTrialExpired(c, now)) return;
  const day = new Date(c!.trialEndDate!).toISOString().slice(0, 10);
  throw new ForbiddenException({
    message: `This company's trial ended on ${day}. Contact the platform administrator to continue.`,
    errors: { code: 'TRIAL_EXPIRED' },
  });
}
