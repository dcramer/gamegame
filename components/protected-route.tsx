import { Suspense, type ReactNode } from 'react';
import { requireAuth, requireAdmin } from '@/lib/session';
import { redirect } from 'next/navigation';

/**
 * Loading skeleton for protected routes
 */
function ProtectedRouteLoading() {
  return (
    <div className="flex items-center justify-center min-h-[400px]">
      <div className="text-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900 dark:border-white mx-auto mb-4"></div>
        <p className="text-sm text-muted-foreground">Verifying access...</p>
      </div>
    </div>
  );
}

/**
 * Guard component that requires admin authentication
 */
async function AdminAuthGuard({ children }: { children: ReactNode }) {
  try {
    await requireAdmin();
    return <>{children}</>;
  } catch (error) {
    // requireAdmin() throws on auth failure, redirect is handled there
    // This catch is for any unexpected errors
    redirect('/auth/signin');
  }
}

/**
 * Guard component that requires any authentication
 */
async function AuthGuard({ children }: { children: ReactNode }) {
  try {
    await requireAuth();
    return <>{children}</>;
  } catch (error) {
    // requireAuth() throws on auth failure, redirect is handled there
    redirect('/auth/signin');
  }
}

/**
 * Wraps content that requires admin authentication with Suspense boundary.
 *
 * This component ensures non-blocking rendering by isolating the async auth
 * check within a Suspense boundary, allowing the rest of the page to stream.
 *
 * @example
 * ```tsx
 * export default function AdminPage() {
 *   return (
 *     <AdminRoute>
 *       <AdminContent />
 *     </AdminRoute>
 *   );
 * }
 * ```
 */
export function AdminRoute({
  children,
  fallback = <ProtectedRouteLoading />,
}: {
  children: ReactNode;
  fallback?: ReactNode;
}) {
  return (
    <Suspense fallback={fallback}>
      <AdminAuthGuard>{children}</AdminAuthGuard>
    </Suspense>
  );
}

/**
 * Wraps content that requires authentication with Suspense boundary.
 *
 * This component ensures non-blocking rendering by isolating the async auth
 * check within a Suspense boundary, allowing the rest of the page to stream.
 *
 * @example
 * ```tsx
 * export default function UserPage() {
 *   return (
 *     <AuthRoute>
 *       <UserContent />
 *     </AuthRoute>
 *   );
 * }
 * ```
 */
export function AuthRoute({
  children,
  fallback = <ProtectedRouteLoading />,
}: {
  children: ReactNode;
  fallback?: ReactNode;
}) {
  return (
    <Suspense fallback={fallback}>
      <AuthGuard>{children}</AuthGuard>
    </Suspense>
  );
}
