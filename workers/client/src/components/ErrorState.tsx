import { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import Layout from './Layout';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';

interface ErrorStateProps {
  title: string;
  message: string;
  actionLabel?: string;
  actionTo?: string;
  children?: ReactNode;
}

export default function ErrorState({
  title,
  message,
  actionLabel = '← Back to games',
  actionTo = '/games',
  children,
}: ErrorStateProps) {
  return (
    <Layout>
      <div className="flex flex-col items-center justify-center py-12">
        <Card className="max-w-md w-full">
          <CardHeader>
            <CardTitle className="text-center text-2xl">{title}</CardTitle>
          </CardHeader>
          <CardContent className="text-center">
            <p className="text-muted-foreground">{message}</p>
            {children && <div className="mt-6">{children}</div>}
            <div className="mt-6">
              <Link to={actionTo}>
                <Button variant="outline" className="w-full">
                  {actionLabel}
                </Button>
              </Link>
            </div>
          </CardContent>
        </Card>
      </div>
    </Layout>
  );
}
