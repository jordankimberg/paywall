import { useState } from 'react';
import {
  useStripe,
  useElements,
  PaymentElement,
} from '@stripe/react-stripe-js';

interface PaymentFormProps {
  onSuccess: (paymentMethodId: string) => void;
  onError: (message: string) => void;
  loading: boolean;
}

export default function PaymentForm({
  onSuccess,
  onError,
  loading,
}: PaymentFormProps) {
  const stripe = useStripe();
  const elements = useElements();
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!stripe || !elements) return;

    setSubmitting(true);

    const { error, setupIntent } = await stripe.confirmSetup({
      elements,
      redirect: 'if_required',
    });

    if (error) {
      onError(error.message || 'Payment failed');
      setSubmitting(false);
      return;
    }

    if (setupIntent?.payment_method) {
      onSuccess(setupIntent.payment_method as string);
    } else {
      onError('No payment method returned');
    }

    setSubmitting(false);
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <PaymentElement />
      <button
        type="submit"
        disabled={!stripe || submitting || loading}
        className="w-full py-3 px-4 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {submitting || loading ? 'Processing...' : 'Subscribe'}
      </button>
    </form>
  );
}
