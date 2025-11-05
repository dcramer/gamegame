import { getCurrentUser } from '@/lib/session';
import { redirect } from 'next/navigation';

export default async function Layout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getCurrentUser();

  if (!user) {
    return redirect('/auth/signin');
  }

  if (!user.isAdmin) {
    return redirect('/');
  }

  return children;
}
