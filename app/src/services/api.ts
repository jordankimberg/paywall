// Empty base — in production, CloudFront routes API paths to API Gateway.
// In local dev, Vite proxy forwards these paths to localhost:3001.
const API_BASE = '';

export interface PlanData {
  price_id: string;
  plan_code: string;
  name: string;
  amount_cents: number;
  interval: string;
  interval_count: number;
  features: string[];
  display_order: number;
  metadata: Record<string, string>;
}

export interface PlansResponse {
  success: boolean;
  data: {
    tenant_name: string;
    product_name: string;
    stripe_publishable_key: string;
    plans: PlanData[];
  };
}

export interface SetupIntentResponse {
  success: boolean;
  data: {
    client_secret?: string;
    customer_id: string;
    price_id: string;
    tenant_id: string;
    product_id: string;
    free_plan?: boolean;
  };
}

export interface FinalizeResponse {
  success: boolean;
  data: {
    subscription_id: string;
    status: string;
    plan_code: string;
    redirect_url: string;
  };
}

export async function fetchPlans(
  tenantId: string,
  productId: string
): Promise<PlansResponse> {
  const res = await fetch(
    `${API_BASE}/plans?tenant=${tenantId}&product=${productId}`
  );
  return res.json();
}

export async function createSetupIntent(params: {
  tenant_id: string;
  email: string;
  price_id: string;
  product_id: string;
  return_url?: string;
}): Promise<SetupIntentResponse> {
  const res = await fetch(`${API_BASE}/checkout/setup-intent`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  });
  return res.json();
}

export async function finalizeSubscription(params: {
  tenant_id: string;
  customer_id: string;
  price_id: string;
  payment_method: string | null;
  product_id: string;
  return_url?: string;
}): Promise<FinalizeResponse> {
  const res = await fetch(`${API_BASE}/subscriptions/finalize`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  });
  return res.json();
}
