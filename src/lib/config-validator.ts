import { NextRequest, NextResponse } from 'next/server';

const REQUIRED_ENV_VARS = [
  'JWT_SECRET',
] as const;

const REQUIRED_IN_PRODUCTION = [
  'AWS_RDS_POSTGRES_URL',
  'UPSTASH_REDIS_REST_URL',
  'UPSTASH_REDIS_REST_TOKEN',
] as const;

let _validated = false;
let _validationResult: { valid: boolean; errors: string[] } | null = null;

export function validateConfig(): { valid: boolean; errors: string[] } {
  if (_validated && _validationResult) return _validationResult;

  const errors: string[] = [];
  const isProduction = process.env.NODE_ENV === 'production';

  for (const envVar of REQUIRED_ENV_VARS) {
    if (!process.env[envVar] || process.env[envVar]!.trim() === '') {
      errors.push(`Missing required environment variable: ${envVar}`);
    }
  }

  // In production, also validate these
  if (isProduction) {
    for (const envVar of REQUIRED_IN_PRODUCTION) {
      if (!process.env[envVar] || process.env[envVar]!.trim() === '') {
        errors.push(`Missing required env var in production: ${envVar}`);
      }
    }

    // Block known dev fallback secrets in production
    const jwtSecret = process.env.JWT_SECRET;
    const DEV_SECRETS = [
      'fluxbase_dev_secret_key_123',
      'dev_secret',
      'secret',
      'test',
    ];
    if (jwtSecret && DEV_SECRETS.includes(jwtSecret.toLowerCase())) {
      errors.push('JWT_SECRET appears to be a dev/placeholder value — this is not safe for production');
    }
  }

  _validated = true;
  _validationResult = { valid: errors.length === 0, errors };
  return _validationResult;
}

/**
 * Middleware helper: call this at the start of critical routes to fail fast
 * if required config is missing.
 */
export function assertConfig(): void {
  const result = validateConfig();
  if (!result.valid) {
    throw new Error(`Configuration error: ${result.errors.join(', ')}`);
  }
}

/**
 * Returns a config validation status suitable for health endpoints.
 */
export function getConfigStatus(): { valid: boolean; errors: string[] } {
  const result = validateConfig();
  return result;
}
