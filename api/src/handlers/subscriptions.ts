import { APIGatewayProxyEvent, APIGatewayProxyResult, Context } from 'aws-lambda';
import Stripe from 'stripe';
import { getStripeClient } from '../services/stripe';
import * as db from '../services/dynamodb';
import { requireAnyKey } from '../middleware/auth';
import { success, error } from '../utils/response';
import { EntitlementCache } from '../types';

/**
 * POST /subscriptions/finalize
 * Creates the subscription in the tenant's Stripe.
 * CRITICAL: Writes to EntitlementCacheTable synchronously before returning.
 *
 * Body: { tenant_id, customer_id, price_id, payment_method, product_id, user_id?, return_url? }
 */
export async function finalizeHandler(
  event: APIGatewayProxyEvent,
  context: Context
): Promise<APIGatewayProxyResult> {
  try {
    const body = JSON.parse(event.body || '{}');
    const {
      tenant_id,
      customer_id,
      price_id,
      payment_method,
      product_id,
      user_id,
      return_url,
    } = body;

    if (!tenant_id) return error('tenant_id is required');
    if (!customer_id) return error('customer_id is required');
    if (!price_id) return error('price_id is required');
    if (!product_id) return error('product_id is required');

    const tenant = await db.getTenant(tenant_id);
    if (!tenant || !tenant.credentialsConfigured) {
      return error('Tenant not configured', 400);
    }

    const product = await db.getProduct(tenant_id, product_id);
    if (!product) return error('Product not found', 404);

    const stripe = await getStripeClient(tenant_id);

    // Fetch price to get product metadata
    const price = await stripe.prices.retrieve(price_id, {
      expand: ['product'],
    });
    const stripeProduct = price.product as Stripe.Product;
    const planCode = stripeProduct.metadata?.plan_code || stripeProduct.id;

    // Build subscription params
    const subscriptionParams: Stripe.SubscriptionCreateParams = {
      customer: customer_id,
      items: [{ price: price_id }],
      expand: ['latest_invoice.payment_intent'],
      metadata: {
        paywall_tenant: tenant_id,
        paywall_product: product_id,
        plan_code: planCode,
      },
    };

    // Attach payment method if provided (null for $0 plans)
    if (payment_method) {
      subscriptionParams.default_payment_method = payment_method;
    }

    const subscription = await stripe.subscriptions.create(subscriptionParams);

    // Get customer email for cache
    const customer = await stripe.customers.retrieve(customer_id);
    const customerEmail =
      (customer as Stripe.Customer).email || '';

    // SYNCHRONOUS cache write — user must see has_access=true immediately
    const userId = user_id || customerEmail;
    const tenantProductKey = `${tenant_id}#${product_id}`;
    const ACTIVE_TTL = 5 * 60; // 5 minutes

    const cacheEntry: EntitlementCache = {
      tenantProductKey,
      userId,
      hasAccess: true,
      subscriptionId: subscription.id,
      planCode,
      status: subscription.status,
      currentPeriodEnd: new Date(
        subscription.current_period_end * 1000
      ).toISOString(),
      userEmail: customerEmail,
      ttl: Math.floor(Date.now() / 1000) + ACTIVE_TTL,
    };

    await db.setEntitlementCache(cacheEntry);
    console.log('Entitlement cache written synchronously for', userId);

    // Call product callback if configured
    if (product.subscriptionCallbackUrl) {
      try {
        await fetch(product.subscriptionCallbackUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            event: 'subscription.created',
            tenant_id,
            product_id,
            email: customerEmail,
            subscription_id: subscription.id,
            plan_code: planCode,
            price_id,
            status: subscription.status,
          }),
        });
        console.log('Product callback sent to', product.subscriptionCallbackUrl);
      } catch (callbackErr) {
        // Don't fail the whole operation if callback fails
        console.warn('Product callback failed:', callbackErr);
      }
    }

    // Build redirect URL
    let redirectUrl = return_url || '';
    if (!redirectUrl && product.allowedReturnUrls.length > 0) {
      redirectUrl = product.allowedReturnUrls[0];
    }

    return success({
      subscription_id: subscription.id,
      status: subscription.status,
      plan_code: planCode,
      redirect_url: redirectUrl,
    });
  } catch (err) {
    console.error('Error finalizing subscription:', err);
    return error('Failed to finalize subscription', 500);
  }
}

/**
 * POST /subscriptions/cancel
 * Cancels a subscription at period end.
 *
 * Body: { tenant_id, subscription_id }
 */
export async function cancelHandler(
  event: APIGatewayProxyEvent,
  context: Context
): Promise<APIGatewayProxyResult> {
  try {
    const auth = await requireAnyKey(event);
    if (!auth) return error('Unauthorized', 401);

    const body = JSON.parse(event.body || '{}');
    const { subscription_id } = body;

    if (!subscription_id) return error('subscription_id is required');

    const stripe = await getStripeClient(auth.tenantId);

    const subscription = await stripe.subscriptions.update(subscription_id, {
      cancel_at_period_end: true,
    });

    return success({
      subscription_id: subscription.id,
      status: subscription.status,
      cancel_at_period_end: subscription.cancel_at_period_end,
      current_period_end: new Date(
        subscription.current_period_end * 1000
      ).toISOString(),
    });
  } catch (err) {
    console.error('Error canceling subscription:', err);
    return error('Failed to cancel subscription', 500);
  }
}

/**
 * GET /subscriptions?email={email}
 * Lists subscriptions for a user.
 */
export async function listHandler(
  event: APIGatewayProxyEvent,
  context: Context
): Promise<APIGatewayProxyResult> {
  try {
    const auth = await requireAnyKey(event);
    if (!auth) return error('Unauthorized', 401);

    const email = event.queryStringParameters?.email;
    if (!email) return error('email query parameter is required');

    const stripe = await getStripeClient(auth.tenantId);

    // Find customer
    const customers = await stripe.customers.list({ email, limit: 1 });
    if (customers.data.length === 0) {
      return success({ subscriptions: [] });
    }

    const subscriptions = await stripe.subscriptions.list({
      customer: customers.data[0].id,
      expand: ['data.items.data.price.product'],
    });

    const result = subscriptions.data.map((sub) => {
      const item = sub.items.data[0];
      const stripeProduct = item?.price.product as Stripe.Product | undefined;
      return {
        subscription_id: sub.id,
        status: sub.status,
        plan_code: stripeProduct?.metadata?.plan_code || stripeProduct?.id || '',
        plan_name: stripeProduct?.name || '',
        current_period_end: new Date(
          sub.current_period_end * 1000
        ).toISOString(),
        cancel_at_period_end: sub.cancel_at_period_end,
      };
    });

    return success({ subscriptions: result });
  } catch (err) {
    console.error('Error listing subscriptions:', err);
    return error('Failed to list subscriptions', 500);
  }
}
