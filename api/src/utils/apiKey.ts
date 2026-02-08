import { createHash, randomBytes } from 'crypto';

/**
 * Generate a raw API key with a prefix.
 * Admin keys: pk_paywall_{random}
 * Product keys: sk_paywall_{random}
 */
export function generateApiKey(type: 'admin' | 'product'): string {
  const prefix = type === 'admin' ? 'pk_paywall' : 'sk_paywall';
  const random = randomBytes(24).toString('hex');
  return `${prefix}_${random}`;
}

/**
 * SHA-256 hash an API key for storage.
 * Raw keys are never stored — only shown once at creation.
 */
export function hashApiKey(rawKey: string): string {
  return createHash('sha256').update(rawKey).digest('hex');
}
