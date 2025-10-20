import { useState } from 'react';
import { Link } from 'react-router-dom';
import Layout from '../components/Layout';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Card, CardHeader, CardTitle, CardContent } from '../components/ui/card';
import Heading from '../components/Heading';

export default function Login() {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });

      if (response.ok) {
        setSent(true);
      } else {
        alert('Failed to send login link');
      }
    } catch (error) {
      console.error('Login error:', error);
      alert('Failed to send login link');
    } finally {
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

          {sent ? (
            <Card>
              <CardContent className="pt-6 text-center">
                <div className="mb-4">
                  <p className="text-lg font-medium mb-2">Check your email!</p>
                  <p className="text-sm text-muted-foreground">
                    We've sent a magic link to <strong>{email}</strong>
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
                <form onSubmit={handleSubmit} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="email">Email address</Label>
                    <Input
                      id="email"
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      required
                      placeholder="you@example.com"
                    />
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
