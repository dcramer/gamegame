import AdminLayout from '@/components/admin-layout';

/**
 * Layout for top-level admin pages (Games list, Workflows, Add Game)
 * Provides the AdminLayout component WITH top-level navigation tabs
 */
export default function HomeLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <AdminLayout>{children}</AdminLayout>;
}
