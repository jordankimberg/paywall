import { APIGatewayProxyEvent, APIGatewayProxyResult, Context } from 'aws-lambda';
import * as db from '../services/dynamodb';
import * as creds from '../services/credentials';
import { requireAdminKey } from '../middleware/auth';
import { success, error } from '../utils/response';

/**
 * POST /tenants/{tenantId}/credentials — Store BYOC Stripe keys.
 * Validates the secret key before storing.
 */
export async function setHandler(
  event: APIGatewayProxyEvent,
  context: Context
): Promise<APIGatewayProxyResult> {
  try {
    const auth = await requireAdminKey(event);
    if (!auth) return error('Unauthorized — admin API key required', 401);

    const tenantId = event.pathParameters?.tenantId;
    if (!tenantId) return error('tenantId is required');
    if (auth.tenantId !== tenantId) return error('Access denied', 403);

    const tenant = await db.getTenant(tenantId);
    if (!tenant) return error('Tenant not found', 404);

    const body = JSON.parse(event.body || '{}');
    const {
      stripe_secret_key,
      stripe_publishable_key,
      stripe_webhook_secret,
    } = body;

    if (!stripe_secret_key || typeof stripe_secret_key !== 'string') {
      return error('stripe_secret_key is required');
    }
    if (!stripe_publishable_key || typeof stripe_publishable_key !== 'string') {
      return error('stripe_publishable_key is required');
    }
    if (!stripe_secret_key.startsWith('sk_')) {
      return error('stripe_secret_key must start with sk_');
    }
    if (!stripe_publishable_key.startsWith('pk_')) {
      return error('stripe_publishable_key must start with pk_');
    }
    if (stripe_webhook_secret && !stripe_webhook_secret.startsWith('whsec_')) {
      return error('stripe_webhook_secret must start with whsec_');
    }

    // Validate the secret key with Stripe
    console.log('Validating Stripe secret key...');
    const validation = await creds.validateStripeKey(stripe_secret_key);
    if (!validation.valid) {
      return error(`Stripe key validation failed: ${validation.error}`);
    }

    // Store secret key + webhook secret in Secrets Manager
    await creds.storeCredentials(tenantId, {
      stripe_secret_key,
      ...(stripe_webhook_secret ? { stripe_webhook_secret } : {}),
    });

    // Store publishable key + status in tenant record (not secret)
    const now = new Date().toISOString();
    await db.updateTenant(tenantId, {
      stripePublishableKey: stripe_publishable_key,
      credentialsConfigured: true,
      credentialsValidatedAt: now,
      updatedAt: now,
    });

    return success({
      status: 'validated',
      publishable_key: stripe_publishable_key,
      validated_at: now,
    });
  } catch (err) {
    console.error('Error setting credentials:', err);
    return error('Failed to store credentials', 500);
  }
}

/**
 * GET /tenants/{tenantId}/credentials — Get credential status (never returns secrets).
 */
export async function getStatusHandler(
  event: APIGatewayProxyEvent,
  context: Context
): Promise<APIGatewayProxyResult> {
  try {
    const auth = await requireAdminKey(event);
    if (!auth) return error('Unauthorized — admin API key required', 401);

    const tenantId = event.pathParameters?.tenantId;
    if (!tenantId) return error('tenantId is required');
    if (auth.tenantId !== tenantId) return error('Access denied', 403);

    const tenant = await db.getTenant(tenantId);
    if (!tenant) return error('Tenant not found', 404);

    return success({
      configured: tenant.credentialsConfigured,
      publishable_key: tenant.stripePublishableKey || null,
      validated_at: tenant.credentialsValidatedAt || null,
    });
  } catch (err) {
    console.error('Error getting credentials status:', err);
    return error('Failed to get credentials status', 500);
  }
}

/**
 * DELETE /tenants/{tenantId}/credentials — Remove BYOC credentials.
 */
export async function deleteHandler(
  event: APIGatewayProxyEvent,
  context: Context
): Promise<APIGatewayProxyResult> {
  try {
    const auth = await requireAdminKey(event);
    if (!auth) return error('Unauthorized — admin API key required', 401);

    const tenantId = event.pathParameters?.tenantId;
    if (!tenantId) return error('tenantId is required');
    if (auth.tenantId !== tenantId) return error('Access denied', 403);

    const tenant = await db.getTenant(tenantId);
    if (!tenant) return error('Tenant not found', 404);

    await creds.deleteCredentials(tenantId);

    const now = new Date().toISOString();
    await db.updateTenant(tenantId, {
      stripePublishableKey: undefined,
      credentialsConfigured: false,
      credentialsValidatedAt: undefined,
      updatedAt: now,
    });

    return success({ deleted: true });
  } catch (err) {
    console.error('Error deleting credentials:', err);
    return error('Failed to delete credentials', 500);
  }
}
