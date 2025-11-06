"use client";

import Link from "next/link";
import { Dices } from "lucide-react";
import { GitHubLogoIcon } from "@radix-ui/react-icons";
import { GITHUB_URL } from "@/constants";
import FlashMessages from "@/components/flashMessages";

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
              <Link href="/" className="flex items-center space-x-2">
                <Dices className="w-6 h-6" />
                <h1 className="text-xl lg:text-2xl font-bold">
                  gamegame
                </h1>
              </Link>
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

        {/* Footer */}
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
