import { APIGatewayProxyEvent, APIGatewayProxyResult, Context } from 'aws-lambda';
import { requireAnyKey } from '../middleware/auth';
import { checkEntitlement } from '../services/entitlements';
import * as db from '../services/dynamodb';
import { success, error } from '../utils/response';

/**
 * POST /entitlements/check
 * Called by products to check if a user has access.
 * Accepts both admin and product API keys.
 * Product keys auto-resolve the tenant+product.
 * Admin keys require product_id in the body.
 */
export async function checkHandler(
  event: APIGatewayProxyEvent,
  context: Context
): Promise<APIGatewayProxyResult> {
  try {
    const auth = await requireAnyKey(event);
    if (!auth) return error('Unauthorized — valid API key required', 401);

    const body = JSON.parse(event.body || '{}');
    const { user_id, user_email, product_id } = body;

    if (!user_email || typeof user_email !== 'string') {
      return error('user_email is required');
    }

    // Resolve product ID
    let productId = auth.productId;
    if (productId === '*') {
      // Admin key — product_id must be provided
      if (!product_id || typeof product_id !== 'string') {
        return error('product_id is required when using admin API key');
      }
      productId = product_id;
    }

    // Use user_id if provided (Cognito sub), otherwise hash email as a fallback key
    const userId = user_id || user_email;

    // Check tenant credentials are configured
    const tenant = await db.getTenant(auth.tenantId);
    if (!tenant || !tenant.credentialsConfigured) {
      return error('Stripe credentials not configured for this tenant', 400);
    }

    // Check product exists
    const product = await db.getProduct(auth.tenantId, productId);
    if (!product) return error('Product not found', 404);

    // Run entitlement check (cache + Stripe fallback)
    const result = await checkEntitlement(
      auth.tenantId,
      productId,
      userId,
      user_email
    );

    if (result.hasAccess) {
      return success({
        has_access: true,
        subscription: {
          status: result.subscription!.status,
          plan_code: result.subscription!.planCode,
          current_period_end: result.subscription!.currentPeriodEnd,
        },
      });
    }

    // Build checkout URL
    const checkoutDomain = product.checkoutDomain || 'https://pay.agentbrigade.ai';
    const params = new URLSearchParams({
      t: auth.tenantId,
      p: productId,
      email: user_email,
    });

    return success({
      has_access: false,
      checkout_url: `${checkoutDomain}/plans?${params.toString()}`,
    });
  } catch (err) {
    console.error('Error checking entitlement:', err);
    return error('Failed to check entitlement', 500);
  }
}
