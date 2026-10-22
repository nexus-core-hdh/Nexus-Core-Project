// Outgoing-mail settings and the non-sending SMTP check (src/modules/auth/smtp-env.ts,
// scripts/verify-smtp.ts) — `npm run test:mail`. No network, no database, no email: the SMTP
// transport is a recording fake.
import { describe, test } from 'node:test';
import * as assert from 'node:assert/strict';
import { auditMailEnv, sanitizeSmtpError, smtpTransportFromEnv, verifySmtpConnection } from '../../src/modules/auth/smtp-env';

const SECRET = 'abcdwxyzefghijkl';
const GMAIL = { SMTP_HOST: 'smtp.gmail.com', SMTP_PORT: '587', SMTP_SECURE: 'false', SMTP_USER: 'office.erp@gmail.com', SMTP_PASS: 'abcd wxyz efgh ijkl', SMTP_FROM: '"Nexus Core" <office.erp@gmail.com>', APP_PUBLIC_URL: 'http://192.168.1.50:3000' };
const status = (env: any) => Object.fromEntries(auditMailEnv(env).map((r) => [r.name, r.status]));

/** Records every call; `fail` makes verify() reject like nodemailer does. */
function fakeTransport(fail?: any) {
  const calls: string[] = [];
  let options: any;
  const create = (o: any) => {
    options = o;
    return {
      verify: async () => { calls.push('verify'); if (fail) throw fail; return true; },
      sendMail: async () => { calls.push('sendMail'); },
      close: () => { calls.push('close'); },
    };
  };
  return { create, calls, options: () => options };
}

describe('MailService environment settings', () => {
  test('same transport as before: SMTP_PORT default 587, SMTP_SECURE only "true", SMTP_FROM falls back to SMTP_USER', () => {
    assert.equal(smtpTransportFromEnv({}), null);
    const t = smtpTransportFromEnv({ SMTP_HOST: 'smtp.gmail.com', SMTP_USER: 'a@gmail.com', SMTP_PASS: 'p', SMTP_SECURE: 'TRUE' })!;
    assert.deepEqual(t.options, { host: 'smtp.gmail.com', port: 587, secure: false, auth: { user: 'a@gmail.com', pass: 'p' } });
    assert.equal(t.from, 'a@gmail.com');
    assert.equal(smtpTransportFromEnv({ SMTP_HOST: 'h' })!.from, 'no-reply@h');
    assert.equal(smtpTransportFromEnv({ ...GMAIL, SMTP_PORT: '465', SMTP_SECURE: 'true' })!.options.secure, true);
  });
});

describe('auditMailEnv', () => {
  test('a complete Gmail setup is configured; nothing missing or invalid', () => {
    const rows = auditMailEnv(GMAIL);
    assert.deepEqual(rows.filter((r) => r.status === 'missing' || r.status === 'invalid'), []);
    assert.match(rows.find((r) => r.name === 'SMTP_PASS')!.note, /Gmail App Password/);
    assert.match(rows.find((r) => r.name === 'APP_PUBLIC_URL')!.note, /private LAN address/);
  });

  test('missing, invalid and mismatched settings are reported', () => {
    assert.deepEqual(status({}), {
      SMTP_HOST: 'missing', SMTP_PORT: 'default', SMTP_SECURE: 'default', SMTP_USER: 'missing', SMTP_PASS: 'missing',
      SMTP_FROM: 'default', APP_PUBLIC_URL: 'missing', FIRST_ADMIN_INVITE_TTL_HOURS: 'default',
    });
    assert.equal(status({ ...GMAIL, SMTP_PORT: 'abc' }).SMTP_PORT, 'invalid');
    assert.equal(status({ ...GMAIL, SMTP_SECURE: 'yes' }).SMTP_SECURE, 'invalid');
    assert.equal(status({ ...GMAIL, SMTP_SECURE: 'true' }).SMTP_SECURE, 'invalid', '"true" with 587');
    assert.equal(status({ ...GMAIL, SMTP_PORT: '465', SMTP_SECURE: 'true' }).SMTP_SECURE, 'configured');
    assert.equal(status({ ...GMAIL, SMTP_USER: 'office.erp' }).SMTP_USER, 'invalid');
    assert.equal(status({ ...GMAIL, APP_PUBLIC_URL: 'http://localhost:3000' }).APP_PUBLIC_URL, 'invalid');
    assert.equal(status({ ...GMAIL, APP_PUBLIC_URL: 'http://192.168.1.50:3000/app' }).APP_PUBLIC_URL, 'invalid');
    assert.match(auditMailEnv({ ...GMAIL, SMTP_FROM: 'other@company.com' }).find((r) => r.name === 'SMTP_FROM')!.note, /Send mail as/);
    assert.match(auditMailEnv({ ...GMAIL, SMTP_PASS: 'my-account-password' }).find((r) => r.name === 'SMTP_PASS')!.note, /not shaped like/);
  });

  test('never contains a setting value', () => {
    const text = JSON.stringify(auditMailEnv(GMAIL));
    for (const v of [SECRET, GMAIL.SMTP_PASS, GMAIL.SMTP_USER, '192.168.1.50']) assert.ok(!text.includes(v), v);
  });
});

describe('verifySmtpConnection (non-sending)', () => {
  test('connects + authenticates via verify(), closes, and never sends', async () => {
    const t = fakeTransport();
    const r = await verifySmtpConnection(GMAIL, t.create);
    assert.deepEqual(r, { ok: true, host: 'smtp.gmail.com', port: 587, secure: false, authenticated: true });
    assert.deepEqual(t.calls, ['verify', 'close']);
    assert.equal(t.options().logger, false);
    assert.equal(t.options().debug, false);
  });

  test('a failure is reported without the password or user, and the connection is still closed', async () => {
    const err = Object.assign(new Error(`Invalid login: 535-5.7.8 Username and Password not accepted for office.erp@gmail.com (${GMAIL.SMTP_PASS} / ${Buffer.from(SECRET).toString('base64')})`), { code: 'EAUTH', responseCode: 535, command: 'AUTH PLAIN' });
    const t = fakeTransport(err);
    const r: any = await verifySmtpConnection(GMAIL, t.create);
    assert.equal(r.ok, false);
    assert.deepEqual([r.error.code, r.error.responseCode, r.error.command], ['EAUTH', 535, 'AUTH PLAIN']);
    for (const s of [GMAIL.SMTP_PASS, SECRET, Buffer.from(SECRET).toString('base64'), GMAIL.SMTP_USER]) assert.ok(!r.error.message.includes(s), s);
    assert.deepEqual(t.calls, ['verify', 'close']);
  });

  test('without SMTP_HOST nothing is attempted', async () => {
    const t = fakeTransport();
    const r: any = await verifySmtpConnection({}, t.create);
    assert.equal(r.error.code, 'NOT_CONFIGURED');
    assert.deepEqual(t.calls, []);
  });

  test('sanitizeSmtpError keeps only code, reply code, command and a redacted message', () => {
    assert.deepEqual(Object.keys(sanitizeSmtpError(new Error('x'), {})).sort(), ['code', 'command', 'message', 'responseCode']);
  });
});
