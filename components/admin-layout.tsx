"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import FlashMessages from "@/components/flashMessages";
import { WorkflowStatusRestorer } from "@/components/workflowFlashMessage";
import { Logo } from "@/components/logo";
import Footer from "@/components/footer";

interface AdminLayoutProps {
  children: React.ReactNode;
  /**
   * Whether to show the top-level navigation tabs.
   * Set to false for detail pages that have their own navigation.
   * @default true
   */
  showNavigation?: boolean;
}

/**
 * Admin layout shell with header, optional navigation tabs, and footer.
 *
 * @example
 * ```tsx
 * // Top-level admin pages with navigation
 * <AdminLayout>
 *   <GameList />
 * </AdminLayout>
 *
 * // Detail pages without top-level navigation
 * <AdminLayout showNavigation={false}>
 *   <GameDetail />
 * </AdminLayout>
 * ```
 */
export default function AdminLayout({ children, showNavigation = true }: AdminLayoutProps) {
  const pathname = usePathname();

  return (
    <FlashMessages>
      <WorkflowStatusRestorer />
      <div className="min-h-screen flex flex-col">
        {/* Header */}
        <header className="border-b border-border">
          <div className="container mx-auto px-4 py-6">
            <div className="flex items-center space-x-2">
              <Logo size="sm" />
              <span className="text-sm text-muted-foreground">/</span>
              <Link href="/admin" className="text-sm text-muted-foreground hover:text-foreground transition-colors">
                admin
              </Link>
            </div>
          </div>
        </header>

        <main className="container mx-auto px-4 py-6 flex-1">
          {children}
        </main>

        <Footer isAdmin={true} />
      </div>
    </FlashMessages>
  );
}
