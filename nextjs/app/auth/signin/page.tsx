'use client';

import { useState } from 'react';
import { signIn } from 'next-auth/react';
import Link from 'next/link';
import Layout from '@/components/layout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent } from '@/components/ui/card';
import Heading from '@/components/heading';

export default function SignInPage() {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email) return;

    setLoading(true);
    setError(null);

    try {
      const result = await signIn('resend', {
        email,
        redirect: false,
        callbackUrl: '/games',
      });

      if (result?.error) {
        setError(result.error);
        setLoading(false);
      } else {
        setSent(true);
        setLoading(false);
      }
    } catch (err) {
      console.error('Sign in error:', err);
      setError('An error occurred. Please try again.');
      setLoading(false);
    }
  };

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
                      <span className="font-medium text-foreground">{email}</span>
                    </p>
                  </div>
                  <div className="pt-2">
                    <Link
                      href="/games"
                      className="text-sm text-muted-foreground hover:text-foreground transition-colors"
                    >
                      ← Back to games
                    </Link>
                  </div>
                </div>
              ) : (
                <form onSubmit={handleSubmit} className="space-y-6">
                  {error && (
                    <div className="bg-destructive/10 text-destructive border border-destructive/20 rounded p-3 text-sm">
                      {error}
                    </div>
                  )}

                  <div className="space-y-2">
                    <Label htmlFor="email">Email address</Label>
                    <Input
                      id="email"
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      required
                      placeholder="you@example.com"
                      autoFocus
                      disabled={loading}
                    />
                    <p className="text-xs text-muted-foreground">
                      We'll send you a magic link to sign in
                    </p>
                  </div>

                  <Button
                    type="submit"
                    disabled={loading || !email}
                    className="w-full"
                  >
                    {loading ? 'Sending...' : 'Send magic link'}
                  </Button>

                  <div className="text-center">
                    <Link
                      href="/games"
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
