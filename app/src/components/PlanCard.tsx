import { PlanData } from '../services/api';

interface PlanCardProps {
  plan: PlanData;
  onSelect: (plan: PlanData) => void;
}

export default function PlanCard({ plan, onSelect }: PlanCardProps) {
  const priceDisplay =
    plan.amount_cents === 0
      ? 'Free'
      : `$${(plan.amount_cents / 100).toFixed(2)}/${plan.interval}`;

  return (
    <div className="border border-gray-200 rounded-xl p-6 bg-white shadow-sm hover:shadow-md transition-shadow">
      <h3 className="text-xl font-semibold mb-2">{plan.name}</h3>
      <p className="text-3xl font-bold mb-4">{priceDisplay}</p>

      {plan.features.length > 0 && (
        <ul className="mb-6 space-y-2">
          {plan.features.map((feature, i) => (
            <li key={i} className="flex items-start gap-2 text-sm text-gray-600">
              <span className="text-green-500 mt-0.5">&#10003;</span>
              {feature}
            </li>
          ))}
        </ul>
      )}

      <button
        onClick={() => onSelect(plan)}
        className="w-full py-3 px-4 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 transition-colors"
      >
        {plan.amount_cents === 0 ? 'Get Started' : 'Subscribe'}
      </button>
    </div>
  );
}
