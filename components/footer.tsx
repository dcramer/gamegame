'use client';

import { GITHUB_URL } from "@/constants";
import { GitHubLogoIcon } from "@radix-ui/react-icons";
import { Dices } from "lucide-react";
import Link from "next/link";

interface FooterProps {
  /**
   * Whether to display the admin link.
   * Set to true in admin layouts to show the admin navigation link.
   * @default false
   */
  isAdmin?: boolean;
}

/**
 * Site footer with navigation links to GitHub, home page, and optionally admin.
 *
 * @example
 * ```tsx
 * // Public pages
 * <Footer />
 *
 * // Admin pages
 * <Footer isAdmin={true} />
 * ```
 */
export default function Footer({ isAdmin }: FooterProps) {
  return (
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
        {isAdmin && (
          <>
            <span>&middot;</span>
            <Link
              href="/admin"
              prefetch={false}
              className="flex items-center gap-1 hover:underline"
            >
              Admin
            </Link>
          </>
        )}
      </div>
    </footer>
  );
}
