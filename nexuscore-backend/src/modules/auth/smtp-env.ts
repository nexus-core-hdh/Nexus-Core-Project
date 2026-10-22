// Outgoing-mail settings from the server environment (nexuscore-backend/.env, loaded by
// ConfigModule at startup) — the single definition MailService uses for its SMTP_* fallback and
// that `npm run smtp:verify` (scripts/verify-smtp.ts) checks without sending anything.
//
// Variables: SMTP_HOST (required), SMTP_PORT (default 587), SMTP_SECURE (only the exact string
// "true" enables implicit TLS — use "true" with 465, "false" with 587/STARTTLS), SMTP_USER,
// SMTP_PASS, SMTP_FROM (default SMTP_USER). Invitation/reset links use APP_PUBLIC_URL.
// Nothing here ever returns or logs a setting's value — only whether it is present and valid.
import * as nodemailer from 'nodemailer';

type Env = Record<string, string | undefined>;

export interface EnvSmtpTransport {
  options: { host: string; port: number; secure: boolean; auth?: { user: string; pass: string | undefined } };
  from: string;
  source: string;
}

/** MailService's SMTP_* transport (unchanged behaviour), or null when SMTP_HOST is not set. */
export function smtpTransportFromEnv(env: Env = process.env): EnvSmtpTransport | null {
  const host = env.SMTP_HOST;
  if (!host) return null;
  return {
    options: {
      host,
      port: Number(env.SMTP_PORT || 587),
      secure: env.SMTP_SECURE === 'true',
      auth: env.SMTP_USER ? { user: env.SMTP_USER, pass: env.SMTP_PASS } : undefined,
    },
    from: env.SMTP_FROM || env.SMTP_USER || `no-reply@${host}`,
    source: 'SMTP_* environment',
  };
}

export type SettingStatus = 'configured' | 'missing' | 'invalid' | 'default';
export interface SettingReport { name: string; status: SettingStatus; note: string }

const PRIVATE_HOST = /^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/;
const LOCAL_HOST = /^(localhost|127\.|\[?::1\]?$)/i;
const addressOf = (from: string) => ((/<([^>]+)>/.exec(from) ?? [null, from])[1] ?? '').trim().toLowerCase();

/** Presence/validity of every mail-related setting — statuses and notes only, never a value. */
export function auditMailEnv(env: Env = process.env): SettingReport[] {
  const has = (n: string) => env[n] != null && String(env[n]).trim() !== '';
  const rows: SettingReport[] = [];
  const add = (name: string, status: SettingStatus, note = '') => rows.push({ name, status, note });

  if (!has('SMTP_HOST')) add('SMTP_HOST', 'missing', 'required (Gmail: smtp.gmail.com)');
  else add('SMTP_HOST', 'configured', /(^|\.)gmail\.com$/i.test(String(env.SMTP_HOST).trim()) ? 'Gmail' : 'not a Gmail host');

  if (!has('SMTP_PORT')) add('SMTP_PORT', 'default', 'unset — 587 is used');
  else {
    const p = Number(env.SMTP_PORT);
    add('SMTP_PORT', Number.isInteger(p) && p > 0 && p < 65536 ? 'configured' : 'invalid', Number.isInteger(p) && p > 0 && p < 65536 ? `port ${p}` : 'not a port number');
  }
  const port = Number(env.SMTP_PORT || 587);

  if (!has('SMTP_SECURE')) add('SMTP_SECURE', 'default', 'unset — treated as false (STARTTLS)');
  else if (!['true', 'false'].includes(String(env.SMTP_SECURE))) add('SMTP_SECURE', 'invalid', 'must be exactly "true" or "false" (anything else is treated as false)');
  else {
    const secure = env.SMTP_SECURE === 'true';
    const mismatch = (secure && port === 587) || (!secure && port === 465);
    add('SMTP_SECURE', mismatch ? 'invalid' : 'configured', mismatch ? `"${env.SMTP_SECURE}" does not fit port ${port} (465 needs "true", 587 needs "false")` : secure ? 'implicit TLS' : 'STARTTLS');
  }

  if (!has('SMTP_USER')) add('SMTP_USER', 'missing', 'required for Gmail (the Gmail address)');
  else add('SMTP_USER', /@/.test(String(env.SMTP_USER)) ? 'configured' : 'invalid', /@/.test(String(env.SMTP_USER)) ? 'email-style login' : 'Gmail needs the full email address');

  if (!has('SMTP_PASS')) add('SMTP_PASS', 'missing', 'required (a Gmail App Password)');
  else {
    const compact = String(env.SMTP_PASS).replace(/\s/g, '');
    add('SMTP_PASS', 'configured', compact.length === 16 && /^[a-z]+$/i.test(compact) ? 'shaped like a Gmail App Password' : 'not shaped like a 16-letter Gmail App Password (an account password will be rejected)');
  }

  if (!has('SMTP_FROM')) add('SMTP_FROM', 'default', has('SMTP_USER') ? 'unset — SMTP_USER is used' : 'unset');
  else if (!/@/.test(addressOf(String(env.SMTP_FROM)))) add('SMTP_FROM', 'invalid', 'no email address in it');
  else if (has('SMTP_USER') && addressOf(String(env.SMTP_FROM)) !== String(env.SMTP_USER).trim().toLowerCase()) {
    add('SMTP_FROM', 'configured', 'differs from SMTP_USER — Gmail only keeps it if it is a verified "Send mail as" address');
  } else add('SMTP_FROM', 'configured', 'same address as SMTP_USER');

  if (!has('APP_PUBLIC_URL')) add('APP_PUBLIC_URL', 'missing', 'links fall back to http://localhost:3000, which only works on the server machine');
  else {
    try {
      const u = new URL(String(env.APP_PUBLIC_URL));
      const kind = LOCAL_HOST.test(u.hostname) ? 'localhost' : PRIVATE_HOST.test(u.hostname) ? 'private LAN address' : 'hostname';
      const problems = [u.protocol === 'http:' || u.protocol === 'https:' ? '' : 'not http(s)', u.pathname !== '/' ? 'has a path (links append /reset-password)' : '', kind === 'localhost' ? 'localhost — other machines cannot open the links' : ''].filter(Boolean);
      add('APP_PUBLIC_URL', problems.length ? 'invalid' : 'configured', problems.length ? problems.join('; ') : `${kind}, ${u.protocol.replace(':', '')}`);
    } catch { add('APP_PUBLIC_URL', 'invalid', 'not a URL'); }
  }

  const ttl = env.FIRST_ADMIN_INVITE_TTL_HOURS;
  if (!has('FIRST_ADMIN_INVITE_TTL_HOURS')) add('FIRST_ADMIN_INVITE_TTL_HOURS', 'default', 'unset — 72 hours');
  else add('FIRST_ADMIN_INVITE_TTL_HOURS', Number.isInteger(Number(ttl)) && Number(ttl) >= 1 && Number(ttl) <= 168 ? 'configured' : 'invalid', 'whole hours 1–168 (otherwise 72 is used)');
  return rows;
}

/** A connection/authentication error without anything secret-bearing: code, SMTP reply code,
 *  failing command, and the message with the user/password (and their encodings) removed. */
export function sanitizeSmtpError(err: any, env: Env = process.env) {
  let message = String(err?.message ?? err ?? 'Unknown error');
  for (const secret of [env.SMTP_PASS, env.SMTP_PASS?.replace(/\s/g, ''), env.SMTP_USER].filter((s): s is string => !!s && s.length >= 3)) {
    for (const form of [secret, Buffer.from(secret).toString('base64')]) message = message.split(form).join('[redacted]');
  }
  return { code: err?.code ?? null, responseCode: err?.responseCode ?? null, command: err?.command ?? null, message: message.slice(0, 300) };
}

/**
 * Connects to the SMTP server, negotiates TLS and authenticates (nodemailer `verify()`), then
 * closes. Sends no message and has no recipient. Never throws; returns a sanitized result.
 */
export async function verifySmtpConnection(env: Env = process.env, createTransport: (o: any) => any = nodemailer.createTransport) {
  const t = smtpTransportFromEnv(env);
  if (!t) return { ok: false as const, error: { code: 'NOT_CONFIGURED', responseCode: null, command: null, message: 'SMTP_HOST is not set — nothing to verify.' } };
  const transporter = createTransport({ ...t.options, connectionTimeout: 15_000, greetingTimeout: 15_000, socketTimeout: 20_000, logger: false, debug: false });
  try {
    await transporter.verify();
    return { ok: true as const, host: t.options.host, port: t.options.port, secure: t.options.secure, authenticated: !!t.options.auth };
  } catch (e) {
    return { ok: false as const, error: sanitizeSmtpError(e, env) };
  } finally {
    try { transporter.close?.(); } catch { /* already closed */ }
  }
}
