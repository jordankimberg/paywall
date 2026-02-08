import { APIGatewayProxyEvent, APIGatewayProxyResult, Context } from 'aws-lambda';
import { v4 as uuidv4 } from 'uuid';
import * as db from '../services/dynamodb';
import { requireAdminKey } from '../middleware/auth';
import { generateApiKey, hashApiKey } from '../utils/apiKey';
import { success, error } from '../utils/response';
import { Tenant, ApiKeyRecord } from '../types';

/**
 * POST /tenants — Register a new tenant.
 * No auth required (this is the first call — creates the tenant + admin key).
 */
export async function createHandler(
  event: APIGatewayProxyEvent,
  context: Context
): Promise<APIGatewayProxyResult> {
  try {
    const body = JSON.parse(event.body || '{}');
    const { name, admin_email } = body;

    if (!name || typeof name !== 'string' || name.trim().length === 0) {
      return error('name is required');
    }
    if (!admin_email || typeof admin_email !== 'string') {
      return error('admin_email is required');
    }

    const now = new Date().toISOString();
    const tenantId = `t_${uuidv4().replace(/-/g, '').slice(0, 12)}`;

    const tenant: Tenant = {
      tenantId,
      name: name.trim(),
      adminEmail: admin_email.trim(),
      credentialsConfigured: false,
      createdAt: now,
      updatedAt: now,
    };

    await db.createTenant(tenant);

    // Generate admin API key
    const rawAdminKey = generateApiKey('admin');
    const apiKeyRecord: ApiKeyRecord = {
      apiKeyHash: hashApiKey(rawAdminKey),
      tenantId,
      productId: '*',
      keyType: 'admin',
      createdAt: now,
    };

    await db.createApiKey(apiKeyRecord);

    return success(
      {
        tenant_id: tenantId,
        name: tenant.name,
        admin_email: tenant.adminEmail,
        api_key: rawAdminKey,
        created_at: now,
      },
      201
    );
  } catch (err) {
    console.error('Error creating tenant:', err);
    return error('Failed to create tenant', 500);
  }
}

/**
 * GET /tenants/{tenantId} — Get tenant details.
 */
export async function getHandler(
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

    return success(tenant);
  } catch (err) {
    console.error('Error getting tenant:', err);
    return error('Failed to get tenant', 500);
  }
}

/**
 * PUT /tenants/{tenantId} — Update tenant details.
 */
export async function updateHandler(
  event: APIGatewayProxyEvent,
  context: Context
): Promise<APIGatewayProxyResult> {
  try {
    const auth = await requireAdminKey(event);
    if (!auth) return error('Unauthorized — admin API key required', 401);

    const tenantId = event.pathParameters?.tenantId;
    if (!tenantId) return error('tenantId is required');
    if (auth.tenantId !== tenantId) return error('Access denied', 403);

    const body = JSON.parse(event.body || '{}');
    const updates: Partial<Omit<Tenant, 'tenantId' | 'createdAt'>> = {
      updatedAt: new Date().toISOString(),
    };

    if (body.name !== undefined) updates.name = body.name.trim();
    if (body.admin_email !== undefined) updates.adminEmail = body.admin_email.trim();

    const updated = await db.updateTenant(tenantId, updates);
    if (!updated) return error('Tenant not found', 404);

    return success(updated);
  } catch (err) {
    console.error('Error updating tenant:', err);
    return error('Failed to update tenant', 500);
  }
}

/**
 * DELETE /tenants/{tenantId} — Delete a tenant and all associated data.
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

    // Delete credentials from Secrets Manager
    const { deleteCredentials } = await import('../services/credentials');
    try {
      await deleteCredentials(tenantId);
    } catch (credErr) {
      console.warn('Error deleting credentials:', credErr);
    }

    // Delete all API keys for this tenant
    const apiKeys = await db.listApiKeysByTenant(tenantId);
    for (const key of apiKeys) {
      await db.deleteApiKey(key.apiKeyHash);
    }

    // Delete all products for this tenant
    const products = await db.listProducts(tenantId);
    for (const product of products) {
      await db.deleteProduct(tenantId, product.productId);
    }

    // Delete the tenant record
    await db.deleteTenant(tenantId);

    return success({ deleted: true });
  } catch (err) {
    console.error('Error deleting tenant:', err);
    return error('Failed to delete tenant', 500);
  }
}
