import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';

export default function Success() {
  const [searchParams] = useSearchParams();
  const returnUrl = searchParams.get('return_url') || '';
  const [countdown, setCountdown] = useState(3);

  useEffect(() => {
    if (!returnUrl) return;

    const interval = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          clearInterval(interval);
          window.location.href = returnUrl;
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [returnUrl]);

  return (
    <div className="min-h-screen flex items-center justify-center px-4">
      <div className="text-center max-w-md">
        <div className="text-5xl mb-4">&#10003;</div>
        <h1 className="text-2xl font-bold mb-2">Subscription Active</h1>
        <p className="text-gray-500 mb-6">
          Your subscription has been set up successfully.
        </p>

        {returnUrl ? (
          <p className="text-sm text-gray-400">
            Redirecting in {countdown}...{' '}
            <a
              href={returnUrl}
              className="text-blue-600 hover:underline"
            >
              Go now
            </a>
          </p>
        ) : (
          <p className="text-sm text-gray-400">
            You can close this window.
          </p>
        )}
      </div>
    </div>
  );
}
