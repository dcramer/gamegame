import { auth } from '@/auth';
import { redirect } from 'next/navigation';

export default async function Layout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();
  if (!session?.user?.isAdmin) {
    if (!session?.user) {
      return redirect('/auth/signin');
    }
    return redirect('/');
  }

  return children;
}
