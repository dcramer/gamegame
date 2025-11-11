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
 * Admin layout - wraps admin pages with authentication check
 */
export default function Layout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <AdminAuthGuard>{children}</AdminAuthGuard>;
}
