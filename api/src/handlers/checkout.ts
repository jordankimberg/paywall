import { APIGatewayProxyEvent, APIGatewayProxyResult, Context } from 'aws-lambda';
import { getStripeClient } from '../services/stripe';
import * as db from '../services/dynamodb';
import { success, error } from '../utils/response';

/**
 * POST /checkout/setup-intent
 * Creates a Stripe SetupIntent for collecting payment method.
 * Finds or creates the customer in the tenant's Stripe account.
 *
 * Body: { tenant_id, email, price_id, product_id, return_url, product_metadata? }
 */
export async function createSetupIntentHandler(
  event: APIGatewayProxyEvent,
  context: Context
): Promise<APIGatewayProxyResult> {
  try {
    const body = JSON.parse(event.body || '{}');
    const { tenant_id, email, price_id, product_id, return_url, product_metadata } = body;

    if (!tenant_id) return error('tenant_id is required');
    if (!email) return error('email is required');
    if (!price_id) return error('price_id is required');
    if (!product_id) return error('product_id is required');

    // Validate tenant + credentials
    const tenant = await db.getTenant(tenant_id);
    if (!tenant) return error('Tenant not found', 404);
    if (!tenant.credentialsConfigured) {
      return error('Stripe credentials not configured', 400);
    }

    // Validate product + return URL
    const product = await db.getProduct(tenant_id, product_id);
    if (!product) return error('Product not found', 404);

    if (return_url && product.allowedReturnUrls.length > 0) {
      const allowed = product.allowedReturnUrls.some((url) =>
        return_url.startsWith(url)
      );
      if (!allowed) {
        return error('return_url is not in the allowed list for this product', 400);
      }
    }

    const stripe = await getStripeClient(tenant_id);

    // Find or create customer
    const customers = await stripe.customers.list({ email, limit: 1 });
    let customerId: string;
    if (customers.data.length > 0) {
      customerId = customers.data[0].id;
    } else {
      const customer = await stripe.customers.create({
        email,
        metadata: {
          paywall_tenant: tenant_id,
          paywall_product: product_id,
          ...(product_metadata || {}),
        },
      });
      customerId = customer.id;
    }

    // Check if this is a $0 plan — if so, no SetupIntent needed
    const price = await stripe.prices.retrieve(price_id);
    if (price.unit_amount === 0) {
      return success({
        free_plan: true,
        customer_id: customerId,
        price_id,
        tenant_id,
        product_id,
      });
    }

    // Create SetupIntent for collecting payment method
    const setupIntent = await stripe.setupIntents.create({
      customer: customerId,
      payment_method_types: ['card'],
      metadata: {
        tenant_id,
        product_id,
        price_id,
        return_url: return_url || '',
        ...(product_metadata ? { product_metadata: JSON.stringify(product_metadata) } : {}),
      },
    });

    return success({
      client_secret: setupIntent.client_secret,
      customer_id: customerId,
      price_id,
      tenant_id,
      product_id,
    });
  } catch (err) {
    console.error('Error creating setup intent:', err);
    return error('Failed to create setup intent', 500);
  }
}
