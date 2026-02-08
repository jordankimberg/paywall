import Stripe from 'stripe';
import { getStripeClient } from './stripe';
import * as db from './dynamodb';
import { EntitlementCache } from '../types';

const ACTIVE_TTL = 5 * 60; // 5 minutes for active subscriptions
const INACTIVE_TTL = 60; // 1 minute for inactive/no-access (re-check sooner)

/**
 * Check entitlement for a user against a tenant+product.
 * 1. Check DynamoDB cache (fast path)
 * 2. If cache miss or expired, query Stripe (slow path)
 * 3. Write result back to cache
 */
export async function checkEntitlement(
  tenantId: string,
  productId: string,
  userId: string,
  userEmail: string
): Promise<{
  hasAccess: boolean;
  subscription?: {
    status: string;
    planCode: string;
    currentPeriodEnd: string;
  };
}> {
  // 1. Check cache
  const cached = await db.getEntitlementCache(tenantId, productId, userId);
  if (cached && cached.ttl > Math.floor(Date.now() / 1000)) {
    return {
      hasAccess: cached.hasAccess,
      subscription: cached.hasAccess
        ? {
            status: cached.status || 'active',
            planCode: cached.planCode || '',
            currentPeriodEnd: cached.currentPeriodEnd || '',
          }
        : undefined,
    };
  }

  // 2. Cache miss — query Stripe
  const stripe = await getStripeClient(tenantId);
  const result = await queryStripeEntitlement(stripe, userEmail, productId);

  // 3. Write to cache
  const tenantProductKey = `${tenantId}#${productId}`;
  const ttlSeconds = result.hasAccess ? ACTIVE_TTL : INACTIVE_TTL;
  const cacheEntry: EntitlementCache = {
    tenantProductKey,
    userId,
    hasAccess: result.hasAccess,
    subscriptionId: result.subscriptionId,
    planCode: result.planCode,
    status: result.status,
    currentPeriodEnd: result.currentPeriodEnd,
    userEmail,
    ttl: Math.floor(Date.now() / 1000) + ttlSeconds,
  };

  await db.setEntitlementCache(cacheEntry);

  return {
    hasAccess: result.hasAccess,
    subscription: result.hasAccess
      ? {
          status: result.status || 'active',
          planCode: result.planCode || '',
          currentPeriodEnd: result.currentPeriodEnd || '',
        }
      : undefined,
  };
}

/**
 * Query Stripe for a customer's active subscription.
 */
async function queryStripeEntitlement(
  stripe: Stripe,
  email: string,
  productId: string
): Promise<{
  hasAccess: boolean;
  subscriptionId?: string;
  planCode?: string;
  status?: string;
  currentPeriodEnd?: string;
}> {
  // Find customer by email
  const customers = await stripe.customers.list({ email, limit: 1 });
  if (customers.data.length === 0) {
    return { hasAccess: false };
  }

  const customer = customers.data[0];

  // List active subscriptions
  const subscriptions = await stripe.subscriptions.list({
    customer: customer.id,
    status: 'active',
    expand: ['data.items.data.price.product'],
  });

  // Also check trialing
  const trialingSubs = await stripe.subscriptions.list({
    customer: customer.id,
    status: 'trialing',
    expand: ['data.items.data.price.product'],
  });

  const allSubs = [...subscriptions.data, ...trialingSubs.data];

  // Find a subscription matching this product's audience
  for (const sub of allSubs) {
    for (const item of sub.items.data) {
      const stripeProduct = item.price.product as Stripe.Product;
      // Match if the Stripe product's audience metadata matches this productId,
      // or if there's no audience filter (single-product tenant)
      const audience = stripeProduct.metadata?.audience;
      if (!audience || audience === productId) {
        return {
          hasAccess: true,
          subscriptionId: sub.id,
          planCode: stripeProduct.metadata?.plan_code || stripeProduct.id,
          status: sub.status,
          currentPeriodEnd: new Date(sub.current_period_end * 1000).toISOString(),
        };
      }
    }
  }

  return { hasAccess: false };
}
