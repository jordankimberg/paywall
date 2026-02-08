import { APIGatewayProxyEvent, APIGatewayProxyResult, Context } from 'aws-lambda';
import Stripe from 'stripe';
import { getStripeClient } from '../services/stripe';
import * as db from '../services/dynamodb';
import { success, error } from '../utils/response';
import { PlanInfo } from '../types';

/**
 * GET /plans?tenant={tenantId}&product={productId}
 * Public endpoint — fetches plans from the tenant's Stripe account.
 * Returns the tenant's publishable key so the frontend can init Stripe Elements.
 */
export async function handler(
  event: APIGatewayProxyEvent,
  context: Context
): Promise<APIGatewayProxyResult> {
  try {
    const tenantId = event.queryStringParameters?.tenant;
    const productId = event.queryStringParameters?.product;

    if (!tenantId) return error('tenant query parameter is required');
    if (!productId) return error('product query parameter is required');

    // Load tenant + product
    const [tenant, product] = await Promise.all([
      db.getTenant(tenantId),
      db.getProduct(tenantId, productId),
    ]);

    if (!tenant) return error('Tenant not found', 404);
    if (!product) return error('Product not found', 404);
    if (!tenant.credentialsConfigured || !tenant.stripePublishableKey) {
      return error('Stripe credentials not configured for this tenant', 400);
    }

    // Fetch active prices from the tenant's Stripe account
    const stripe = await getStripeClient(tenantId);
    const prices = await stripe.prices.list({
      active: true,
      expand: ['data.product'],
    });

    // Filter to recurring prices and map to plan format.
    // Products in Stripe should have metadata: plan_code, features (JSON array), display_order, audience
    // Optionally filter by audience matching productId
    const plans: PlanInfo[] = prices.data
      .filter((price) => {
        if (!price.recurring) return false;
        const stripeProduct = price.product as Stripe.Product;
        if (!stripeProduct.active) return false;
        // If the Stripe product has an audience metadata, filter by productId.
        // Supports comma-separated audiences for bundles (e.g. "compass_studio,compass_chat")
        if (stripeProduct.metadata?.audience) {
          const audiences = stripeProduct.metadata.audience.split(',').map((a) => a.trim());
          if (!audiences.includes(productId)) return false;
        }
        return true;
      })
      .map((price) => {
        const stripeProduct = price.product as Stripe.Product;
        let features: string[] = [];
        try {
          if (stripeProduct.metadata?.features) {
            features = JSON.parse(stripeProduct.metadata.features);
          }
        } catch {
          features = [];
        }

        return {
          price_id: price.id,
          plan_code: stripeProduct.metadata?.plan_code || stripeProduct.id,
          name: stripeProduct.name,
          amount_cents: price.unit_amount || 0,
          interval: price.recurring?.interval || 'month',
          interval_count: price.recurring?.interval_count || 1,
          features,
          display_order: parseInt(stripeProduct.metadata?.display_order || '999', 10),
          metadata: stripeProduct.metadata || {},
        };
      })
      .sort((a, b) => a.display_order - b.display_order);

    return success({
      tenant_name: tenant.name,
      product_name: product.productName,
      stripe_publishable_key: tenant.stripePublishableKey,
      plans,
    });
  } catch (err) {
    console.error('Error fetching plans:', err);
    return error('Failed to fetch plans', 500);
  }
}
