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
import { useApiForm } from '../hooks/useAsyncForm';
import { createMeta, createLoginTitle } from '../lib/meta';

export const meta = () => {
  return createMeta({
    title: createLoginTitle(),
    description: "Sign in to GameGame to access admin features and manage board game resources.",
    noIndex: true, // Don't index login pages
  });
};

export default function Login() {
  const form = useFormState({ email: '' });
  const [sent, setSent] = useState(false);

  const { handleSubmit, loading, error } = useApiForm({
    url: '/auth/login',
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

          <Card>
            <CardContent className="pt-6">
              {sent ? (
                <div className="text-center space-y-4">
                  <div>
                    <p className="text-lg font-medium mb-2">Check your email!</p>
                    <p className="text-sm text-muted-foreground">
                      We've sent a magic link to{' '}
                      <span className="font-medium text-foreground">{form.values.email}</span>
                    </p>
                  </div>
                  <div className="pt-2">
                    <Link
                      to="/games"
                      className="text-sm text-muted-foreground hover:text-foreground transition-colors"
                    >
                      ← Back to games
                    </Link>
                  </div>
                </div>
              ) : (
                <form onSubmit={(e) => handleSubmit(e, form.values)} className="space-y-6">
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
                      autoFocus
                    />
                    <p className="text-xs text-muted-foreground">
                      We'll send you a magic link to sign in
                    </p>
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
                      className="text-sm text-muted-foreground hover:text-foreground transition-colors"
                    >
                      ← Back to games
                    </Link>
                  </div>
                </form>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </Layout>
  );
}
