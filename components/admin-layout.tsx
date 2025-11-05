"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Dices } from "lucide-react";
import { GitHubLogoIcon } from "@radix-ui/react-icons";
import { GITHUB_URL } from "@/constants";
import FlashMessages from "@/components/flashMessages";

interface AdminLayoutProps {
  children: React.ReactNode;
}

export default function AdminLayout({ children }: AdminLayoutProps) {
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
    // Jobs tab is active for /admin/jobs and sub-paths
    return pathname.startsWith(path);
  };

  return (
    <FlashMessages>
      <div className="min-h-screen flex flex-col">
        {/* Header */}
        <header className="border-b border-border">
          <div className="container mx-auto px-4 py-6">
            <Link href="/" className="flex items-center space-x-2">
              <Dices className="w-6 h-6" />
              <h1 className="text-xl lg:text-2xl font-bold">
                gamegame <span className="text-sm text-muted-foreground">/ admin</span>
              </h1>
            </Link>
          </div>

          {/* Navigation */}
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
                href="/admin/jobs"
                className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
                  isActive("/admin/jobs")
                    ? "border-primary text-foreground"
                    : "border-transparent text-muted-foreground hover:text-foreground hover:border-border"
                }`}
              >
                Jobs
              </Link>
            </div>
          </nav>
        </header>

        <main className="container mx-auto px-4 py-6 flex-1">
          {children}
        </main>

        {/* Footer - client-safe version with admin link always visible */}
        <footer className="container mx-auto px-4 py-8 text-center text-muted-foreground font-mono text-xs">
          <div className="flex justify-center items-center gap-4">
            <Link
              prefetch={false}
              href={GITHUB_URL}
              className="flex items-center gap-1 hover:underline"
            >
              <GitHubLogoIcon className="w-4 h-4" />
              GitHub
            </Link>
            <span>&middot;</span>
            <Link
              href="/"
              prefetch={false}
              className="flex items-center gap-1 hover:underline"
            >
              <Dices className="w-4 h-4" />
              GameGame
            </Link>
            <span>&middot;</span>
            <Link
              href="/admin"
              prefetch={false}
              className="flex items-center gap-1 hover:underline"
            >
              Admin
            </Link>
          </div>
        </footer>
      </div>
    </FlashMessages>
  );
}
