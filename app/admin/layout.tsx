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

/**
 * Loading fallback for admin authentication check
 */
function AdminAuthLoading() {
  return (
    <div className="flex items-center justify-center min-h-[400px]">
      <div className="text-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900 dark:border-white mx-auto mb-4"></div>
        <p className="text-sm text-muted-foreground">Verifying admin access...</p>
      </div>
    </div>
  );
}

/**
 * Admin layout - wraps admin pages with authentication check
 * Uses Suspense to prevent blocking rendering while checking authentication
 */
export default function Layout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <Suspense fallback={<AdminAuthLoading />}>
      <AdminAuthGuard>{children}</AdminAuthGuard>
    </Suspense>
  );
}
