'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { Field, FieldLabel, FieldHelp } from '@/components/ui/field';
import Heading from '@/components/heading';

export default function SignInForm() {
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
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });

      const data = await response.json();

      if (!response.ok) {
        setError(data.error || 'An error occurred. Please try again.');
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

                <Field>
                  <FieldLabel htmlFor="email">Email address</FieldLabel>
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
                  <FieldHelp>
                    We'll send you a magic link to sign in
                  </FieldHelp>
                </Field>

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
  );
}
