import { registerAs } from '@nestjs/config';
import { Logger } from '@nestjs/common';
import { randomBytes } from 'crypto';

const logger = new Logger('[NexusCore] JwtConfig');

// Values that have ever shipped in this repository (code fallbacks, .env.example). Anyone with the
// source can forge tokens signed with them, so production refuses to start with any of these.
const KNOWN_PLACEHOLDERS = new Set([
  'nexuscore-secret',
  'nexuscore-refresh-secret',
  'change-me-in-production-very-long-secret-key',
  'change-me-refresh-secret-very-long',
  'secret',
  'changeme',
]);
const MIN_LENGTH = 32;

function problemWith(value: string | undefined): string | null {
  if (!value) return 'is not set';
  if (KNOWN_PLACEHOLDERS.has(value) || /change-?me/i.test(value)) return 'is a known placeholder value';
  if (value.length < MIN_LENGTH) return `is shorter than ${MIN_LENGTH} characters`;
  return null;
}

/**
 * Production (NODE_ENV=production) fails fast on a missing, placeholder or weak secret — there is
 * no fallback value. Development keeps working: a missing secret gets a random per-process value
 * (tokens then stop working after a restart) and weak values only log a warning.
 */
function resolveSecret(name: string, isProduction: boolean): string {
  const value = process.env[name];
  const problem = problemWith(value);
  if (!problem) return value as string;
  if (isProduction) {
    throw new Error(
      `${name} ${problem}. Set a random value of at least ${MIN_LENGTH} characters ` +
        `(e.g. node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))").`,
    );
  }
  if (!value) {
    logger.warn(`${name} is not set — using a random per-process secret (development only).`);
    return randomBytes(48).toString('base64url');
  }
  logger.warn(`${name} ${problem} — acceptable for development only; production will refuse to start.`);
  return value;
}

export default registerAs('jwt', () => {
  const isProduction = process.env.NODE_ENV === 'production';
  const secret = resolveSecret('NEXUSCORE_JWT_SECRET', isProduction);
  const refreshSecret = resolveSecret('NEXUSCORE_JWT_REFRESH_SECRET', isProduction);
  if (isProduction && secret === refreshSecret) {
    throw new Error('NEXUSCORE_JWT_SECRET and NEXUSCORE_JWT_REFRESH_SECRET must be different values.');
  }
  return {
    secret,
    expiresIn: process.env.NEXUSCORE_JWT_EXPIRES_IN || '7d',
    refreshSecret,
    refreshExpiresIn: process.env.NEXUSCORE_JWT_REFRESH_EXPIRES_IN || '30d',
    issuer: process.env.NEXUSCORE_JWT_ISSUER || 'nexuscore',
  };
});
