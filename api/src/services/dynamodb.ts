import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
  UpdateCommand,
  DeleteCommand,
  QueryCommand,
  ScanCommand,
} from '@aws-sdk/lib-dynamodb';
import { Tenant, Product, ApiKeyRecord, EntitlementCache, WebhookAudit } from '../types';

const client = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(client, {
  marshallOptions: {
    removeUndefinedValues: true,
  },
});

const TENANTS_TABLE = process.env.TENANTS_TABLE!;
const PRODUCTS_TABLE = process.env.PRODUCTS_TABLE!;
const API_KEYS_TABLE = process.env.API_KEYS_TABLE!;
const ENTITLEMENT_CACHE_TABLE = process.env.ENTITLEMENT_CACHE_TABLE!;
const WEBHOOK_AUDIT_TABLE = process.env.WEBHOOK_AUDIT_TABLE!;

// ==================== TENANTS ====================

export async function createTenant(tenant: Tenant): Promise<void> {
  await docClient.send(
    new PutCommand({
      TableName: TENANTS_TABLE,
      Item: tenant,
      ConditionExpression: 'attribute_not_exists(tenantId)',
    })
  );
}

export async function getTenant(tenantId: string): Promise<Tenant | null> {
  const result = await docClient.send(
    new GetCommand({
      TableName: TENANTS_TABLE,
      Key: { tenantId },
    })
  );
  return (result.Item as Tenant) || null;
}

export async function updateTenant(
  tenantId: string,
  updates: Partial<Omit<Tenant, 'tenantId' | 'createdAt'>>
): Promise<Tenant | null> {
  const updateExpressions: string[] = [];
  const expressionAttributeNames: Record<string, string> = {};
  const expressionAttributeValues: Record<string, unknown> = {};

  Object.entries(updates).forEach(([key, value]) => {
    if (value !== undefined) {
      updateExpressions.push(`#${key} = :${key}`);
      expressionAttributeNames[`#${key}`] = key;
      expressionAttributeValues[`:${key}`] = value;
    }
  });

  if (updateExpressions.length === 0) {
    return getTenant(tenantId);
  }

  const result = await docClient.send(
    new UpdateCommand({
      TableName: TENANTS_TABLE,
      Key: { tenantId },
      UpdateExpression: `SET ${updateExpressions.join(', ')}`,
      ExpressionAttributeNames: expressionAttributeNames,
      ExpressionAttributeValues: expressionAttributeValues,
      ReturnValues: 'ALL_NEW',
    })
  );
  return (result.Attributes as Tenant) || null;
}

export async function deleteTenant(tenantId: string): Promise<void> {
  await docClient.send(
    new DeleteCommand({
      TableName: TENANTS_TABLE,
      Key: { tenantId },
    })
  );
}

// ==================== PRODUCTS ====================

export async function createProduct(product: Product): Promise<void> {
  await docClient.send(
    new PutCommand({
      TableName: PRODUCTS_TABLE,
      Item: product,
      ConditionExpression: 'attribute_not_exists(tenantId) AND attribute_not_exists(productId)',
    })
  );
}

export async function getProduct(
  tenantId: string,
  productId: string
): Promise<Product | null> {
  const result = await docClient.send(
    new GetCommand({
      TableName: PRODUCTS_TABLE,
      Key: { tenantId, productId },
    })
  );
  return (result.Item as Product) || null;
}

export async function updateProduct(
  tenantId: string,
  productId: string,
  updates: Partial<Omit<Product, 'tenantId' | 'productId' | 'createdAt'>>
): Promise<Product | null> {
  const updateExpressions: string[] = [];
  const expressionAttributeNames: Record<string, string> = {};
  const expressionAttributeValues: Record<string, unknown> = {};

  Object.entries(updates).forEach(([key, value]) => {
    if (value !== undefined) {
      updateExpressions.push(`#${key} = :${key}`);
      expressionAttributeNames[`#${key}`] = key;
      expressionAttributeValues[`:${key}`] = value;
    }
  });

  if (updateExpressions.length === 0) {
    return getProduct(tenantId, productId);
  }

  const result = await docClient.send(
    new UpdateCommand({
      TableName: PRODUCTS_TABLE,
      Key: { tenantId, productId },
      UpdateExpression: `SET ${updateExpressions.join(', ')}`,
      ExpressionAttributeNames: expressionAttributeNames,
      ExpressionAttributeValues: expressionAttributeValues,
      ReturnValues: 'ALL_NEW',
    })
  );
  return (result.Attributes as Product) || null;
}

export async function deleteProduct(
  tenantId: string,
  productId: string
): Promise<void> {
  await docClient.send(
    new DeleteCommand({
      TableName: PRODUCTS_TABLE,
      Key: { tenantId, productId },
    })
  );
}

export async function listProducts(tenantId: string): Promise<Product[]> {
  const result = await docClient.send(
    new QueryCommand({
      TableName: PRODUCTS_TABLE,
      KeyConditionExpression: 'tenantId = :tenantId',
      ExpressionAttributeValues: {
        ':tenantId': tenantId,
      },
    })
  );
  return (result.Items as Product[]) || [];
}

// ==================== API KEYS ====================

export async function createApiKey(record: ApiKeyRecord): Promise<void> {
  await docClient.send(
    new PutCommand({
      TableName: API_KEYS_TABLE,
      Item: record,
    })
  );
}

export async function getApiKeyByHash(apiKeyHash: string): Promise<ApiKeyRecord | null> {
  const result = await docClient.send(
    new GetCommand({
      TableName: API_KEYS_TABLE,
      Key: { apiKeyHash },
    })
  );
  return (result.Item as ApiKeyRecord) || null;
}

export async function deleteApiKey(apiKeyHash: string): Promise<void> {
  await docClient.send(
    new DeleteCommand({
      TableName: API_KEYS_TABLE,
      Key: { apiKeyHash },
    })
  );
}

export async function listApiKeysByTenant(tenantId: string): Promise<ApiKeyRecord[]> {
  const result = await docClient.send(
    new QueryCommand({
      TableName: API_KEYS_TABLE,
      IndexName: 'tenant-index',
      KeyConditionExpression: 'tenantId = :tenantId',
      ExpressionAttributeValues: {
        ':tenantId': tenantId,
      },
    })
  );
  return (result.Items as ApiKeyRecord[]) || [];
}

// ==================== ENTITLEMENT CACHE ====================

export async function getEntitlementCache(
  tenantId: string,
  productId: string,
  userId: string
): Promise<EntitlementCache | null> {
  const tenantProductKey = `${tenantId}#${productId}`;
  const result = await docClient.send(
    new GetCommand({
      TableName: ENTITLEMENT_CACHE_TABLE,
      Key: { tenantProductKey, userId },
    })
  );
  return (result.Item as EntitlementCache) || null;
}

export async function setEntitlementCache(cache: EntitlementCache): Promise<void> {
  await docClient.send(
    new PutCommand({
      TableName: ENTITLEMENT_CACHE_TABLE,
      Item: cache,
    })
  );
}

export async function deleteEntitlementCache(
  tenantId: string,
  productId: string,
  userId: string
): Promise<void> {
  const tenantProductKey = `${tenantId}#${productId}`;
  await docClient.send(
    new DeleteCommand({
      TableName: ENTITLEMENT_CACHE_TABLE,
      Key: { tenantProductKey, userId },
    })
  );
}

// ==================== WEBHOOK AUDIT ====================

export async function getWebhookAudit(
  tenantId: string,
  eventId: string
): Promise<WebhookAudit | null> {
  const tenantEventKey = `${tenantId}#${eventId}`;
  const result = await docClient.send(
    new GetCommand({
      TableName: WEBHOOK_AUDIT_TABLE,
      Key: { tenantEventKey },
    })
  );
  return (result.Item as WebhookAudit) || null;
}

export async function createWebhookAudit(audit: WebhookAudit): Promise<void> {
  await docClient.send(
    new PutCommand({
      TableName: WEBHOOK_AUDIT_TABLE,
      Item: audit,
      ConditionExpression: 'attribute_not_exists(tenantEventKey)',
    })
  );
}
