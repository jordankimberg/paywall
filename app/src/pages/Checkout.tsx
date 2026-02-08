import { useEffect, useState } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { loadStripe, Stripe } from '@stripe/stripe-js';
import { Elements } from '@stripe/react-stripe-js';
import {
  fetchPlans,
  createSetupIntent,
  finalizeSubscription,
} from '../services/api';
import PaymentForm from '../components/PaymentForm';

export default function Checkout() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  const tenantId = searchParams.get('t') || '';
  const productId = searchParams.get('p') || '';
  const email = searchParams.get('email') || '';
  const priceId = searchParams.get('price_id') || '';
  const returnUrl = searchParams.get('return_url') || '';

  const [stripePromise, setStripePromise] =
    useState<Promise<Stripe | null> | null>(null);
  const [clientSecret, setClientSecret] = useState('');
  const [customerId, setCustomerId] = useState('');
  const [loading, setLoading] = useState(true);
  const [finalizing, setFinalizing] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!tenantId || !productId || !email || !priceId) {
      setError('Missing required parameters');
      setLoading(false);
      return;
    }

    // 1. Fetch publishable key + init Stripe
    // 2. Create SetupIntent
    (async () => {
      try {
        const plansRes = await fetchPlans(tenantId, productId);
        if (!plansRes.success || !plansRes.data) {
          setError('Failed to load checkout');
          return;
        }

        setStripePromise(loadStripe(plansRes.data.stripe_publishable_key));

        const setupRes = await createSetupIntent({
          tenant_id: tenantId,
          email,
          price_id: priceId,
          product_id: productId,
          return_url: returnUrl,
        });

        if (!setupRes.success || !setupRes.data) {
          setError('Failed to initialize checkout');
          return;
        }

        // $0 plan — skip payment form, finalize directly
        if (setupRes.data.free_plan) {
          await handleFinalize(null, setupRes.data.customer_id);
          return;
        }

        setClientSecret(setupRes.data.client_secret || '');
        setCustomerId(setupRes.data.customer_id);
      } catch {
        setError('Failed to initialize checkout');
      } finally {
        setLoading(false);
      }
    })();
  }, [tenantId, productId, email, priceId]);

  async function handleFinalize(
    paymentMethod: string | null,
    cId?: string
  ) {
    setFinalizing(true);
    try {
      const res = await finalizeSubscription({
        tenant_id: tenantId,
        customer_id: cId || customerId,
        price_id: priceId,
        payment_method: paymentMethod,
        product_id: productId,
        return_url: returnUrl,
      });

      if (res.success && res.data) {
        const params = new URLSearchParams({
          return_url: res.data.redirect_url || returnUrl,
        });
        navigate(`/success?${params.toString()}`);
      } else {
        setError('Subscription failed');
      }
    } catch {
      setError('Subscription failed');
    } finally {
      setFinalizing(false);
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-pulse text-gray-400">
          Preparing checkout...
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-red-500">{error}</div>
      </div>
    );
  }

  if (!stripePromise || !clientSecret) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-gray-400">Initializing payment...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen py-12 px-4">
      <div className="max-w-md mx-auto">
        <h1 className="text-2xl font-bold mb-6 text-center">
          Complete Your Subscription
        </h1>

        <div className="bg-white border border-gray-200 rounded-xl p-6 shadow-sm">
          <Elements
            stripe={stripePromise}
            options={{
              clientSecret,
              appearance: { theme: 'stripe' },
            }}
          >
            <PaymentForm
              onSuccess={(pm) => handleFinalize(pm)}
              onError={(msg) => setError(msg)}
              loading={finalizing}
            />
          </Elements>
        </div>
      </div>
    </div>
  );
}
