import Link from 'next/link';
import Layout from '@/components/layout';
import { Card, CardContent } from '@/components/ui/card';
import Heading from '@/components/heading';

export default function VerifyPage() {
  return (
    <Layout>
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="w-full max-w-md">
          <div className="text-center mb-8">
            <Heading className="text-3xl mb-2">Check your email</Heading>
          </div>

          <Card>
            <CardContent className="pt-6 text-center space-y-4">
              <div>
                <p className="text-lg font-medium mb-2">A sign in link has been sent to your email address.</p>
                <p className="text-sm text-muted-foreground">
                  Click the link in the email to sign in to your account.
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
            </CardContent>
          </Card>
        </div>
      </div>
    </Layout>
  );
}
