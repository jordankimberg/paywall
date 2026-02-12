import { useEffect, useState } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { fetchPlans, PlanData } from '../services/api';
import PlanCard from '../components/PlanCard';

export default function Plans() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  const tenantId = searchParams.get('t') || '';
  const productId = searchParams.get('p') || '';
  const email = searchParams.get('email') || '';
  const returnUrl = searchParams.get('return_url') || '';

  const [plans, setPlans] = useState<PlanData[]>([]);
  const [tenantName, setTenantName] = useState('');
  const [productName, setProductName] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!tenantId || !productId) {
      setError('Missing tenant or product parameters');
      setLoading(false);
      return;
    }

    fetchPlans(tenantId, productId)
      .then((res) => {
        if (res.success && res.data) {
          setPlans(res.data.plans);
          setTenantName(res.data.tenant_name);
          setProductName(res.data.product_name);
        } else {
          setError('Failed to load plans');
        }
      })
      .catch(() => setError('Failed to load plans'))
      .finally(() => setLoading(false));
  }, [tenantId, productId]);

  function handleSelect(plan: PlanData) {
    const params = new URLSearchParams({
      t: tenantId,
      p: productId,
      email,
      price_id: plan.price_id,
      return_url: returnUrl,
    });
    navigate(`/pay?${params.toString()}`);
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-pulse text-gray-400">Loading plans...</div>
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

  return (
    <div className="min-h-screen py-12 px-4">
      <div className="max-w-4xl mx-auto">
        <div className="text-center mb-10">
          <h1 className="text-3xl font-bold mb-2">{productName}</h1>
          <p className="text-gray-500">Choose a plan to get started</p>
        </div>

        <div
          className={`grid gap-6 ${
            plans.length === 1
              ? 'max-w-sm mx-auto'
              : plans.length === 2
              ? 'grid-cols-1 md:grid-cols-2 max-w-2xl mx-auto'
              : 'grid-cols-1 md:grid-cols-3'
          }`}
        >
          {plans.map((plan) => (
            <PlanCard key={plan.price_id} plan={plan} onSelect={handleSelect} />
          ))}
        </div>

        {tenantName && (
          <p className="text-center text-xs text-gray-400 mt-10">
            Powered by {tenantName}
          </p>
        )}
      </div>
    </div>
  );
}
