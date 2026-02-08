import { APIGatewayProxyEvent, APIGatewayProxyResult, Context } from 'aws-lambda';
import * as db from '../services/dynamodb';
import { requireAdminKey } from '../middleware/auth';
import { generateApiKey, hashApiKey } from '../utils/apiKey';
import { success, error } from '../utils/response';
import { Product, ApiKeyRecord } from '../types';

/**
 * POST /tenants/{tenantId}/products — Register a new product.
 */
export async function createHandler(
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
      product_id,
      product_name,
      checkout_domain,
      allowed_return_urls,
      subscription_callback_url,
    } = body;

    if (!product_id || typeof product_id !== 'string') {
      return error('product_id is required');
    }
    if (!product_name || typeof product_name !== 'string') {
      return error('product_name is required');
    }

    const existing = await db.getProduct(tenantId, product_id);
    if (existing) return error('Product already exists for this tenant', 409);

    const now = new Date().toISOString();
    const product: Product = {
      tenantId,
      productId: product_id,
      productName: product_name.trim(),
      checkoutDomain: checkout_domain || undefined,
      allowedReturnUrls: allowed_return_urls || [],
      subscriptionCallbackUrl: subscription_callback_url || undefined,
      createdAt: now,
      updatedAt: now,
    };

    await db.createProduct(product);

    // Generate a product-scoped API key
    const rawProductKey = generateApiKey('product');
    const apiKeyRecord: ApiKeyRecord = {
      apiKeyHash: hashApiKey(rawProductKey),
      tenantId,
      productId: product_id,
      keyType: 'product',
      createdAt: now,
    };

    await db.createApiKey(apiKeyRecord);

    return success(
      {
        tenant_id: tenantId,
        product_id: product.productId,
        product_name: product.productName,
        product_api_key: rawProductKey,
        created_at: now,
      },
      201
    );
  } catch (err) {
    console.error('Error creating product:', err);
    return error('Failed to create product', 500);
  }
}

/**
 * GET /tenants/{tenantId}/products — List all products for a tenant.
 */
export async function listHandler(
  event: APIGatewayProxyEvent,
  context: Context
): Promise<APIGatewayProxyResult> {
  try {
    const auth = await requireAdminKey(event);
    if (!auth) return error('Unauthorized — admin API key required', 401);

    const tenantId = event.pathParameters?.tenantId;
    if (!tenantId) return error('tenantId is required');
    if (auth.tenantId !== tenantId) return error('Access denied', 403);

    const products = await db.listProducts(tenantId);

    return success(
      products.map((p) => ({
        product_id: p.productId,
        product_name: p.productName,
        checkout_domain: p.checkoutDomain,
        allowed_return_urls: p.allowedReturnUrls,
        subscription_callback_url: p.subscriptionCallbackUrl,
        created_at: p.createdAt,
        updated_at: p.updatedAt,
      }))
    );
  } catch (err) {
    console.error('Error listing products:', err);
    return error('Failed to list products', 500);
  }
}

/**
 * GET /tenants/{tenantId}/products/{productId} — Get a single product.
 */
export async function getHandler(
  event: APIGatewayProxyEvent,
  context: Context
): Promise<APIGatewayProxyResult> {
  try {
    const auth = await requireAdminKey(event);
    if (!auth) return error('Unauthorized — admin API key required', 401);

    const tenantId = event.pathParameters?.tenantId;
    const productId = event.pathParameters?.productId;
    if (!tenantId || !productId) return error('tenantId and productId are required');
    if (auth.tenantId !== tenantId) return error('Access denied', 403);

    const product = await db.getProduct(tenantId, productId);
    if (!product) return error('Product not found', 404);

    return success(product);
  } catch (err) {
    console.error('Error getting product:', err);
    return error('Failed to get product', 500);
  }
}

/**
 * PUT /tenants/{tenantId}/products/{productId} — Update a product.
 */
export async function updateHandler(
  event: APIGatewayProxyEvent,
  context: Context
): Promise<APIGatewayProxyResult> {
  try {
    const auth = await requireAdminKey(event);
    if (!auth) return error('Unauthorized — admin API key required', 401);

    const tenantId = event.pathParameters?.tenantId;
    const productId = event.pathParameters?.productId;
    if (!tenantId || !productId) return error('tenantId and productId are required');
    if (auth.tenantId !== tenantId) return error('Access denied', 403);

    const existing = await db.getProduct(tenantId, productId);
    if (!existing) return error('Product not found', 404);

    const body = JSON.parse(event.body || '{}');
    const updates: Partial<Omit<Product, 'tenantId' | 'productId' | 'createdAt'>> = {
      updatedAt: new Date().toISOString(),
    };

    if (body.product_name !== undefined) updates.productName = body.product_name.trim();
    if (body.checkout_domain !== undefined) updates.checkoutDomain = body.checkout_domain;
    if (body.allowed_return_urls !== undefined) updates.allowedReturnUrls = body.allowed_return_urls;
    if (body.subscription_callback_url !== undefined) updates.subscriptionCallbackUrl = body.subscription_callback_url;

    const updated = await db.updateProduct(tenantId, productId, updates);
    if (!updated) return error('Product not found', 404);

    return success(updated);
  } catch (err) {
    console.error('Error updating product:', err);
    return error('Failed to update product', 500);
  }
}

/**
 * DELETE /tenants/{tenantId}/products/{productId} — Delete a product.
 */
export async function deleteHandler(
  event: APIGatewayProxyEvent,
  context: Context
): Promise<APIGatewayProxyResult> {
  try {
    const auth = await requireAdminKey(event);
    if (!auth) return error('Unauthorized — admin API key required', 401);

    const tenantId = event.pathParameters?.tenantId;
    const productId = event.pathParameters?.productId;
    if (!tenantId || !productId) return error('tenantId and productId are required');
    if (auth.tenantId !== tenantId) return error('Access denied', 403);

    const existing = await db.getProduct(tenantId, productId);
    if (!existing) return error('Product not found', 404);

    // Delete product API keys
    const allKeys = await db.listApiKeysByTenant(tenantId);
    const productKeys = allKeys.filter((k) => k.productId === productId);
    for (const key of productKeys) {
      await db.deleteApiKey(key.apiKeyHash);
    }

    await db.deleteProduct(tenantId, productId);

    return success({ deleted: true });
  } catch (err) {
    console.error('Error deleting product:', err);
    return error('Failed to delete product', 500);
  }
}
