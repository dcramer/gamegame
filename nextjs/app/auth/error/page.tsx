import Link from 'next/link';
import Layout from '@/components/layout';
import { Card, CardContent } from '@/components/ui/card';
import Heading from '@/components/heading';
import { Button } from '@/components/ui/button';

export default function AuthErrorPage() {
  return (
    <Layout>
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="w-full max-w-md">
          <div className="text-center mb-8">
            <Heading className="text-3xl mb-2">Authentication Error</Heading>
          </div>

          <Card>
            <CardContent className="pt-6 text-center space-y-4">
              <div>
                <p className="text-lg font-medium mb-2">There was a problem signing you in.</p>
                <p className="text-sm text-muted-foreground">
                  The link may have expired or already been used. Please try signing in again.
                </p>
              </div>

              <div className="pt-2 flex flex-col gap-2">
                <Link href="/auth/signin">
                  <Button className="w-full">
                    Try again
                  </Button>
                </Link>
                <Link
                  href="/games"
                  className="text-sm text-muted-foreground hover:text-foreground transition-colors"
                >
                  ← Back to games
                </Link>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </Layout>
  );
}
