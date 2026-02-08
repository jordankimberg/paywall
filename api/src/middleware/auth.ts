import { APIGatewayProxyEvent } from 'aws-lambda';
import { getApiKeyByHash } from '../services/dynamodb';
import { hashApiKey } from '../utils/apiKey';
import { ResolvedApiKey } from '../types';

/**
 * Resolve an API key from the x-api-key header.
 * Returns the tenant/product context, or null if invalid.
 */
export async function resolveApiKey(
  event: APIGatewayProxyEvent
): Promise<ResolvedApiKey | null> {
  const rawKey =
    event.headers['x-api-key'] ||
    event.headers['X-Api-Key'] ||
    event.headers['X-API-KEY'];

  if (!rawKey) return null;

  const hash = hashApiKey(rawKey);
  const record = await getApiKeyByHash(hash);
  if (!record) return null;

  return {
    tenantId: record.tenantId,
    productId: record.productId,
    keyType: record.keyType,
  };
}

/**
 * Require an admin API key. Returns the resolved key or null.
 */
export async function requireAdminKey(
  event: APIGatewayProxyEvent
): Promise<ResolvedApiKey | null> {
  const resolved = await resolveApiKey(event);
  if (!resolved || resolved.keyType !== 'admin') return null;
  return resolved;
}

/**
 * Require any valid API key (admin or product).
 */
export async function requireAnyKey(
  event: APIGatewayProxyEvent
): Promise<ResolvedApiKey | null> {
  return resolveApiKey(event);
}
