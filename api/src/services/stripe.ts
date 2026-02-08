import Stripe from 'stripe';
import { getStripeSecretKey } from './credentials';

interface CachedClient {
  client: Stripe;
  expiry: number;
}

const clientCache = new Map<string, CachedClient>();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

/**
 * Get a Stripe client for a tenant.
 * Caches clients with a 5-minute TTL to avoid repeated Secrets Manager calls.
 */
export async function getStripeClient(tenantId: string): Promise<Stripe> {
  const cached = clientCache.get(tenantId);
  if (cached && cached.expiry > Date.now()) {
    return cached.client;
  }

  const secretKey = await getStripeSecretKey(tenantId);
  if (!secretKey) {
    throw new Error(`No Stripe credentials configured for tenant ${tenantId}`);
  }

  const client = new Stripe(secretKey);
  clientCache.set(tenantId, { client, expiry: Date.now() + CACHE_TTL });
  return client;
}

/**
 * Invalidate the cached Stripe client for a tenant.
 * Call this when credentials are updated or deleted.
 */
export function invalidateStripeClient(tenantId: string): void {
  clientCache.delete(tenantId);
}
