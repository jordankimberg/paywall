import { APIGatewayProxyEvent, APIGatewayProxyResult, Context } from 'aws-lambda';
import Stripe from 'stripe';
import { getStripeClient } from '../services/stripe';
import { getStripeWebhookSecret } from '../services/credentials';
import * as db from '../services/dynamodb';
import { json } from '../utils/response';
import { EntitlementCache, WebhookAudit } from '../types';

const ACTIVE_TTL = 5 * 60; // 5 minutes
const AUDIT_TTL = 30 * 24 * 60 * 60; // 30 days

/**
 * POST /webhooks/stripe/{tenantId}
 * Multi-tenant webhook handler with per-tenant signature verification.
 */
export async function handler(
  event: APIGatewayProxyEvent,
  context: Context
): Promise<APIGatewayProxyResult> {
  const tenantId = event.pathParameters?.tenantId;
  if (!tenantId) {
    return json(400, { error: 'tenantId is required' });
  }

  try {
    // Get the tenant's webhook secret
    const webhookSecret = await getStripeWebhookSecret(tenantId);
    if (!webhookSecret) {
      console.error(`No webhook secret for tenant ${tenantId}`);
      return json(400, { error: 'Webhook not configured for this tenant' });
    }

    // Get the Stripe signature header
    const signature =
      event.headers['stripe-signature'] || event.headers['Stripe-Signature'];
    if (!signature) {
      return json(400, { error: 'Missing stripe-signature header' });
    }

    // Verify and construct the event
    const stripe = await getStripeClient(tenantId);
    let stripeEvent: Stripe.Event;
    try {
      stripeEvent = stripe.webhooks.constructEvent(
        event.body || '',
        signature,
        webhookSecret
      );
    } catch (err) {
      console.error('Webhook signature verification failed:', err);
      return json(400, { error: 'Invalid signature' });
    }

    // Idempotency check
    const existingAudit = await db.getWebhookAudit(tenantId, stripeEvent.id);
    if (existingAudit) {
      console.log(`Webhook ${stripeEvent.id} already processed for tenant ${tenantId}`);
      return json(200, { received: true, duplicate: true });
    }

    // Process the event
    let result: 'success' | 'error' = 'success';
    let errorMessage: string | undefined;

    try {
      await processWebhookEvent(tenantId, stripe, stripeEvent);
    } catch (err) {
      result = 'error';
      errorMessage = err instanceof Error ? err.message : 'Unknown error';
      console.error(`Error processing webhook ${stripeEvent.type}:`, err);
    }

    // Write audit record (idempotency + audit trail)
    const audit: WebhookAudit = {
      tenantEventKey: `${tenantId}#${stripeEvent.id}`,
      tenantId,
      eventType: stripeEvent.type,
      processedAt: new Date().toISOString(),
      result,
      errorMessage,
      ttl: Math.floor(Date.now() / 1000) + AUDIT_TTL,
    };

    await db.createWebhookAudit(audit);

    return json(200, { received: true });
  } catch (err) {
    console.error('Webhook handler error:', err);
    return json(500, { error: 'Internal server error' });
  }
}

/**
 * Process a verified Stripe webhook event.
 * Updates the entitlement cache based on subscription lifecycle events.
 */
async function processWebhookEvent(
  tenantId: string,
  stripe: Stripe,
  event: Stripe.Event
): Promise<void> {
  switch (event.type) {
    case 'customer.subscription.created':
    case 'customer.subscription.updated': {
      const subscription = event.data.object as Stripe.Subscription;
      await updateEntitlementFromSubscription(tenantId, stripe, subscription);
      break;
    }

    case 'customer.subscription.deleted': {
      const subscription = event.data.object as Stripe.Subscription;
      await revokeEntitlementFromSubscription(tenantId, stripe, subscription);
      break;
    }

    case 'invoice.payment_failed': {
      const invoice = event.data.object as Stripe.Invoice;
      if (invoice.subscription) {
        const subscription = await stripe.subscriptions.retrieve(
          invoice.subscription as string,
          { expand: ['items.data.price.product'] }
        );
        await updateEntitlementFromSubscription(tenantId, stripe, subscription);
      }
      break;
    }

    default:
      console.log(`Unhandled webhook event type: ${event.type}`);
  }
}

/**
 * Update entitlement cache from a subscription (created/updated).
 */
async function updateEntitlementFromSubscription(
  tenantId: string,
  stripe: Stripe,
  subscription: Stripe.Subscription
): Promise<void> {
  const customer = await stripe.customers.retrieve(subscription.customer as string);
  const email = (customer as Stripe.Customer).email;
  if (!email) return;

  // Get product metadata
  const fullSub = subscription.items?.data[0]?.price?.product
    ? subscription
    : await stripe.subscriptions.retrieve(subscription.id, {
        expand: ['items.data.price.product'],
      });

  const item = fullSub.items.data[0];
  const stripeProduct = item?.price.product as Stripe.Product | undefined;
  const planCode = stripeProduct?.metadata?.plan_code || stripeProduct?.id || '';
  const productId =
    subscription.metadata?.paywall_product ||
    stripeProduct?.metadata?.audience ||
    '*';

  const hasAccess =
    subscription.status === 'active' || subscription.status === 'trialing';

  const tenantProductKey = `${tenantId}#${productId}`;
  const userId = subscription.metadata?.user_id || email;

  const cache: EntitlementCache = {
    tenantProductKey,
    userId,
    hasAccess,
    subscriptionId: subscription.id,
    planCode,
    status: subscription.status,
    currentPeriodEnd: new Date(
      subscription.current_period_end * 1000
    ).toISOString(),
    userEmail: email,
    ttl: Math.floor(Date.now() / 1000) + ACTIVE_TTL,
  };

  await db.setEntitlementCache(cache);
  console.log(
    `Entitlement cache updated: tenant=${tenantId} product=${productId} user=${userId} access=${hasAccess}`
  );
}

/**
 * Revoke entitlement when a subscription is deleted/canceled.
 */
async function revokeEntitlementFromSubscription(
  tenantId: string,
  stripe: Stripe,
  subscription: Stripe.Subscription
): Promise<void> {
  const customer = await stripe.customers.retrieve(subscription.customer as string);
  const email = (customer as Stripe.Customer).email;
  if (!email) return;

  const fullSub = subscription.items?.data[0]?.price?.product
    ? subscription
    : await stripe.subscriptions.retrieve(subscription.id, {
        expand: ['items.data.price.product'],
      });

  const item = fullSub.items.data[0];
  const stripeProduct = item?.price.product as Stripe.Product | undefined;
  const productId =
    subscription.metadata?.paywall_product ||
    stripeProduct?.metadata?.audience ||
    '*';

  const tenantProductKey = `${tenantId}#${productId}`;
  const userId = subscription.metadata?.user_id || email;

  // Write revoked entry (short TTL — will be re-checked soon)
  const cache: EntitlementCache = {
    tenantProductKey,
    userId,
    hasAccess: false,
    subscriptionId: subscription.id,
    status: subscription.status,
    userEmail: email,
    ttl: Math.floor(Date.now() / 1000) + 60, // 1 minute TTL for revocation
  };

  await db.setEntitlementCache(cache);
  console.log(
    `Entitlement revoked: tenant=${tenantId} product=${productId} user=${userId}`
  );
}
