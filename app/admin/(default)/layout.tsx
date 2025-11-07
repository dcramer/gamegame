import AdminLayout from '@/components/admin-layout';

/**
 * Layout for detail pages (Game details, Resource details, Attachment details)
 * Provides the AdminLayout component WITHOUT top-level navigation tabs
 */
export default function DefaultLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <AdminLayout showNavigation={false}>{children}</AdminLayout>;
}
