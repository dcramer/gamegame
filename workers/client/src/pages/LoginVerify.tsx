import { useEffect, useState } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import Layout from '../components/Layout';
import { Spinner } from '../components/ui/spinner';
import { Card, CardContent } from '../components/ui/card';
import { Button } from '../components/ui/button';
import Heading from '../components/Heading';

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

    // Call verification endpoint
    fetch(`/api/auth/verify?token=${encodeURIComponent(token)}`)
      .then(async (res) => {
        if (res.ok) {
          setStatus('success');
          // Redirect to admin after 2 seconds
          setTimeout(() => {
            navigate('/admin');
          }, 2000);
        } else {
          const data = await res.json();
          setStatus('error');
          setError(data.error || 'Verification failed');
        }
      })
      .catch((err) => {
        console.error('Verification error:', err);
        setStatus('error');
        setError('Failed to verify login link');
      });
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
