import { useEffect, useState } from 'react';
import { useSearchParams, useNavigate } from 'react-router';
import Layout from '../components/Layout';
import { Spinner } from '../components/ui/spinner';
import { Card, CardContent } from '../components/ui/card';
import { Button } from '../components/ui/button';
import Heading from '../components/Heading';
import { apiClient } from '../../load-context';
import { z } from 'zod';
import { createMeta, createVerifyTitle } from '../lib/meta';

export const meta = () => {
  return createMeta({
    title: createVerifyTitle(),
    description: "Verifying your email address...",
    noIndex: true, // Don't index verification pages
  });
};

// Schema for error response
const errorResponseSchema = z.object({
  error: z.string(),
});

export default function LoginVerify() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [status, setStatus] = useState<'verifying' | 'success' | 'error'>('verifying');
  const [error, setError] = useState<string>('');

  useEffect(() => {
    const token = searchParams.get('token');

    if (!token) {
      setStatus('error');
      setError('No verification token provided');
      return;
    }

    // Use an async function to properly handle all promise rejections
    const verifyToken = async () => {
      try {
        const res = await apiClient.fetch(`/auth/verify?token=${encodeURIComponent(token)}`);

        if (res.ok) {
          // Auth response may not have a body for verify endpoint, but validate if present
          setStatus('success');
          // Redirect to admin after 2 seconds
          setTimeout(() => {
            navigate('/admin');
          }, 2000);
        } else {
          // Handle error response
          try {
            const json = await res.json();
            const data = errorResponseSchema.parse(json);
            setStatus('error');
            setError(data.error || 'Verification failed');
          } catch (parseError) {
            console.error('Failed to parse error response:', parseError);
            setStatus('error');
            setError(`Verification failed (${res.status})`);
          }
        }
      } catch (err) {
        console.error('Verification error:', err);
        setStatus('error');
        setError(err instanceof Error ? err.message : 'Failed to verify login link');
      }
    };

    // Call async function - no unhandled promise
    verifyToken();
  }, [searchParams, navigate]);

  return (
    <Layout>
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="w-full max-w-md">
          <Card>
            <CardContent>
              {status === 'verifying' && (
                <div className="text-center py-8">
                  <Spinner size="lg" className="mx-auto mb-4" />
                  <Heading className="text-xl mb-2">Verifying...</Heading>
                  <p className="text-muted-foreground">Please wait while we log you in</p>
                </div>
              )}

              {status === 'success' && (
                <div className="text-center py-8">
                  <div className="text-green-600 text-5xl mb-4">✓</div>
                  <Heading className="text-xl mb-2">Success!</Heading>
                  <p className="text-muted-foreground mb-4">You're now logged in</p>
                  <p className="text-sm text-muted-foreground">Redirecting...</p>
                </div>
              )}

              {status === 'error' && (
                <div className="text-center py-8">
                  <div className="text-red-600 text-5xl mb-4">✗</div>
                  <Heading className="text-xl mb-2">Verification Failed</Heading>
                  <p className="text-muted-foreground mb-6">{error}</p>
                  <Button onClick={() => navigate('/login')}>Back to Login</Button>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </Layout>
  );
}
