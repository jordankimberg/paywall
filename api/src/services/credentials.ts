import {
  SecretsManagerClient,
  CreateSecretCommand,
  GetSecretValueCommand,
  PutSecretValueCommand,
  DeleteSecretCommand,
  ResourceNotFoundException,
} from '@aws-sdk/client-secrets-manager';

const secretsClient = new SecretsManagerClient({});

const SECRET_PREFIX = 'paywall/stripe/';

interface StripeCredentials {
  stripe_secret_key: string;
  stripe_webhook_secret?: string;
}

/**
 * Store a tenant's Stripe credentials in Secrets Manager.
 * Updates if exists, creates if not.
 */
export async function storeCredentials(
  tenantId: string,
  credentials: StripeCredentials
): Promise<void> {
  const secretName = `${SECRET_PREFIX}${tenantId}`;
  const secretValue = JSON.stringify(credentials);

  try {
    await secretsClient.send(
      new PutSecretValueCommand({
        SecretId: secretName,
        SecretString: secretValue,
      })
    );
  } catch (err) {
    if (err instanceof ResourceNotFoundException) {
      await secretsClient.send(
        new CreateSecretCommand({
          Name: secretName,
          SecretString: secretValue,
          Description: `BYOC Stripe credentials for paywall tenant ${tenantId}`,
        })
      );
    } else {
      throw err;
    }
  }
}

/**
 * Get a tenant's Stripe secret key from Secrets Manager.
 */
export async function getStripeSecretKey(tenantId: string): Promise<string | null> {
  const secretName = `${SECRET_PREFIX}${tenantId}`;

  try {
    const result = await secretsClient.send(
      new GetSecretValueCommand({ SecretId: secretName })
    );
    if (!result.SecretString) return null;
    const parsed = JSON.parse(result.SecretString) as StripeCredentials;
    return parsed.stripe_secret_key;
  } catch (err) {
    if (err instanceof ResourceNotFoundException) return null;
    throw err;
  }
}

/**
 * Get a tenant's Stripe webhook signing secret from Secrets Manager.
 */
export async function getStripeWebhookSecret(tenantId: string): Promise<string | null> {
  const secretName = `${SECRET_PREFIX}${tenantId}`;

  try {
    const result = await secretsClient.send(
      new GetSecretValueCommand({ SecretId: secretName })
    );
    if (!result.SecretString) return null;
    const parsed = JSON.parse(result.SecretString) as StripeCredentials;
    return parsed.stripe_webhook_secret || null;
  } catch (err) {
    if (err instanceof ResourceNotFoundException) return null;
    throw err;
  }
}

/**
 * Delete a tenant's Stripe credentials from Secrets Manager.
 */
export async function deleteCredentials(tenantId: string): Promise<void> {
  const secretName = `${SECRET_PREFIX}${tenantId}`;

  try {
    await secretsClient.send(
      new DeleteSecretCommand({
        SecretId: secretName,
        ForceDeleteWithoutRecovery: true,
      })
    );
  } catch (err) {
    if (err instanceof ResourceNotFoundException) return;
    throw err;
  }
}

/**
 * Validate Stripe credentials by making a test API call.
 * Returns true if the key can list products.
 */
export async function validateStripeKey(
  secretKey: string
): Promise<{ valid: boolean; error?: string }> {
  // Dynamic import to avoid loading Stripe at module level for Lambda cold starts
  const Stripe = (await import('stripe')).default;

  try {
    const stripe = new Stripe(secretKey);
    await stripe.products.list({ limit: 1 });
    return { valid: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    if (message.includes('Invalid API Key')) {
      return { valid: false, error: 'Invalid Stripe API key' };
    }
    return { valid: false, error: message };
  }
}
