import { Suspense } from 'react';

import { getCurrentUser } from '@/lib/session';
import { redirect } from 'next/navigation';

/**
 * Admin authentication guard component
 * Checks for valid admin session and redirects if unauthorized
 */
async function AdminAuthGuard({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();

  if (!user) {
    redirect('/auth/signin');
  }

  if (!user.isAdmin) {
    redirect('/');
  }

  return <>{children}</>;
}

function AdminLayoutFallback() {
  return (
    <div className="p-6 text-sm text-muted-foreground">
      Checking admin access...
    </div>
  );
}

/**
 * Admin layout - wraps admin pages with authentication check
 */
export default function Layout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <Suspense fallback={<AdminLayoutFallback />}>
      <AdminAuthGuard>{children}</AdminAuthGuard>
    </Suspense>
  );
}
