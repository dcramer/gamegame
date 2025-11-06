"use client";

import Link from "next/link";
import FlashMessages from "@/components/flashMessages";
import { Logo } from "@/components/logo";
import Footer from "@/components/footer";

interface AdminBaseLayoutProps {
  children: React.ReactNode;
}

/**
 * Base admin layout with header and footer, but without navigation tabs.
 * Used for detail pages that shouldn't show the Games/Jobs navigation.
 */
export default function AdminBaseLayout({ children }: AdminBaseLayoutProps) {
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
        </header>

        <main className="container mx-auto px-4 py-6 flex-1">
          {children}
        </main>

        <Footer isAdmin={true} />
      </div>
    </FlashMessages>
  );
}
