// ==================== TENANTS ====================

export interface Tenant {
  tenantId: string;
  name: string;
  adminEmail: string;
  stripePublishableKey?: string;
  credentialsConfigured: boolean;
  credentialsValidatedAt?: string;
  createdAt: string;
  updatedAt: string;
}

// ==================== PRODUCTS ====================

export interface Product {
  tenantId: string;
  productId: string;
  productName: string;
  checkoutDomain?: string;
  allowedReturnUrls: string[];
  subscriptionCallbackUrl?: string;
  createdAt: string;
  updatedAt: string;
}

// ==================== API KEYS ====================

export interface ApiKeyRecord {
  apiKeyHash: string;
  tenantId: string;
  productId: string; // '*' for admin keys
  keyType: 'admin' | 'product';
  createdAt: string;
}

export interface ResolvedApiKey {
  tenantId: string;
  productId: string;
  keyType: 'admin' | 'product';
}

// ==================== ENTITLEMENT CACHE ====================

export interface EntitlementCache {
  tenantProductKey: string; // tenantId#productId
  userId: string;
  hasAccess: boolean;
  subscriptionId?: string;
  planCode?: string;
  status?: string;
  currentPeriodEnd?: string;
  userEmail?: string;
  ttl: number;
}

// ==================== WEBHOOK AUDIT ====================

export interface WebhookAudit {
  tenantEventKey: string; // tenantId#eventId
  tenantId: string;
  eventType: string;
  processedAt: string;
  result: 'success' | 'error';
  errorMessage?: string;
  ttl: number;
}

// ==================== API RESPONSES ====================

export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
}

export interface EntitlementCheckRequest {
  user_id?: string;
  user_email: string;
}

export interface EntitlementCheckResponse {
  has_access: boolean;
  subscription?: {
    status: string;
    plan_code: string;
    current_period_end: string;
  };
  checkout_url?: string;
}

export interface PlansResponse {
  tenant_name: string;
  product_name: string;
  stripe_publishable_key: string;
  plans: PlanInfo[];
}

export interface PlanInfo {
  price_id: string;
  plan_code: string;
  name: string;
  amount_cents: number;
  interval: string;
  interval_count: number;
  features: string[];
  display_order: number;
  metadata: Record<string, string>; // All Stripe product metadata passed through
}
