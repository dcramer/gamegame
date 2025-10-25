import { useState } from 'react';
import { Link } from 'react-router';
import Layout from '../components/Layout';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Card, CardContent } from '../components/ui/card';
import Heading from '../components/Heading';
import { AlertMessage } from '../components/AlertMessage';
import { useFormState } from '../hooks/useFormState';
import { useFetchForm } from '../hooks/useAsyncForm';

export default function Login() {
  const form = useFormState({ email: '' });
  const [sent, setSent] = useState(false);

  const { handleSubmit, loading, error } = useFetchForm({
    url: '/api/auth/login',
    method: 'POST',
    onSuccess: () => {
      setSent(true);
    },
  });

  return (
    <Layout>
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="w-full max-w-md">
          <div className="text-center mb-8">
            <Heading className="text-3xl mb-2">Sign In</Heading>
            <p className="text-muted-foreground">
              Sign in to continue to GameGame
            </p>
          </div>

          {sent ? (
            <Card>
              <CardContent className="pt-6 text-center">
                <div className="mb-4">
                  <p className="text-lg font-medium mb-2">Check your email!</p>
                  <p className="text-sm text-muted-foreground">
                    We've sent a magic link to <strong>{form.values.email}</strong>
                  </p>
                </div>
                <Link
                  to="/games"
                  className="inline-block text-blue-600 hover:underline text-sm"
                >
                  ← Back to games
                </Link>
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardContent className="pt-6">
                <form onSubmit={(e) => handleSubmit(e, form.values)} className="space-y-4">
                  {error && <AlertMessage variant="error" message={error} />}

                  <div className="space-y-2">
                    <Label htmlFor="email">Email address</Label>
                    <Input
                      id="email"
                      type="email"
                      value={form.values.email}
                      onChange={(e) => form.setField('email', e.target.value)}
                      required
                      placeholder="you@example.com"
                    />
                  </div>

                  <Button
                    type="submit"
                    disabled={loading || !form.values.email}
                    className="w-full"
                  >
                    {loading ? 'Sending...' : 'Send magic link'}
                  </Button>

                  <div className="text-center">
                    <Link
                      to="/games"
                      className="text-sm text-muted-foreground hover:underline"
                    >
                      ← Back to games
                    </Link>
                  </div>
                </form>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </Layout>
  );
}
