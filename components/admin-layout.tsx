"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import FlashMessages from "@/components/flashMessages";
import { Logo } from "@/components/logo";
import Footer from "@/components/footer";

interface AdminLayoutProps {
  children: React.ReactNode;
  /**
   * Whether to show the top-level navigation tabs (Games/Workflows).
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

  const isActive = (path: string) => {
    if (path === "/admin") {
      // Games tab is active for /admin, /admin/games/*, and /admin/add-game
      return (
        pathname === "/admin" ||
        pathname.startsWith("/admin/games") ||
        pathname.startsWith("/admin/add-game")
      );
    }
    // Workflows tab is active for /admin/workflows and sub-paths
    return pathname.startsWith(path);
  };

  return (
    <FlashMessages>
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

          {/* Navigation - only shown when showNavigation is true */}
          {showNavigation && (
            <nav className="container mx-auto px-4">
              <div className="flex gap-1 -mb-px">
                <Link
                  href="/admin"
                  className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
                    isActive("/admin")
                      ? "border-primary text-foreground"
                      : "border-transparent text-muted-foreground hover:text-foreground hover:border-border"
                  }`}
                >
                  Games
                </Link>
                <Link
                  href="/admin/workflows"
                  className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
                    isActive("/admin/workflows")
                      ? "border-primary text-foreground"
                      : "border-transparent text-muted-foreground hover:text-foreground hover:border-border"
                  }`}
                >
                  Workflows
                </Link>
              </div>
            </nav>
          )}
        </header>

        <main className="container mx-auto px-4 py-6 flex-1">
          {children}
        </main>

        <Footer isAdmin={true} />
      </div>
    </FlashMessages>
  );
}
