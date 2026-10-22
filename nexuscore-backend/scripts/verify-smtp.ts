// Opt-in, NON-SENDING check of the outgoing-mail settings:   npm run smtp:verify
//
//  1. Reads nexuscore-backend/.env the way the backend does (the shell environment wins) and
//     prints each mail setting's status — never a value.
//  2. Only when SMTP_HOST/SMTP_USER/SMTP_PASS are present: connects to the SMTP server, negotiates
//     TLS and authenticates (nodemailer verify()), then closes the connection. No message is
//     composed or sent, there is no recipient, and no application service, database or
//     invitation/user/company code is loaded.
// Exit code: 0 verified, 1 connection/authentication failed, 2 settings missing or invalid.
import * as path from 'path';
import * as dotenv from 'dotenv';
import { auditMailEnv, verifySmtpConnection } from '../src/modules/auth/smtp-env';

dotenv.config({ path: path.resolve(__dirname, '../.env') }); // does not override the shell environment

async function main() {
  const rows = auditMailEnv(process.env);
  console.log('Mail settings (values are never shown):');
  for (const r of rows) console.log(`  ${r.name.padEnd(29)} ${r.status.padEnd(10)} ${r.note}`);

  const blocking = rows.filter((r) => ['SMTP_HOST', 'SMTP_USER', 'SMTP_PASS'].includes(r.name) && r.status === 'missing')
    .concat(rows.filter((r) => r.status === 'invalid' && r.name.startsWith('SMTP_')));
  if (blocking.length) {
    console.log(`\nNot verified: ${blocking.map((r) => `${r.name} ${r.status}`).join(', ')}. No connection was attempted.`);
    process.exitCode = 2;
    return;
  }

  console.log('\nConnecting (TLS + authentication only — no message is sent)...');
  const result = await verifySmtpConnection(process.env);
  if (result.ok) {
    console.log(`VERIFIED: connected to ${result.host}:${result.port} (${result.secure ? 'implicit TLS' : 'STARTTLS'}) and authenticated. No email was sent.`);
    process.exitCode = 0;
  } else {
    const e = result.error;
    console.log(`FAILED: ${e.message}${e.code ? ` [code ${e.code}]` : ''}${e.responseCode ? ` [SMTP ${e.responseCode}]` : ''}${e.command ? ` [during ${e.command}]` : ''}. No email was sent.`);
    if (e.responseCode === 535) console.log('Hint: Gmail needs an App Password (Google Account → Security → 2-Step Verification → App passwords), not the account password.');
    process.exitCode = 1;
  }
}

main().catch((e) => { console.error('smtp:verify crashed before connecting:', (e as Error)?.name ?? 'Error'); process.exitCode = 1; });
