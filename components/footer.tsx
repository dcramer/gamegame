import { auth } from "@/auth";
import { GitHubLogoIcon } from "@radix-ui/react-icons";
import { Dices } from "lucide-react";
import Link from "next/link";

export default async function Footer() {
  const session = await auth();

  return (
    <footer className="container mx-auto px-4 py-8 text-center text-muted-foreground font-mono text-xs">
      <div className="flex justify-center items-center gap-4">
        <Link
          prefetch={false}
          href="https://github.com/dcramer/gamegame"
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
        {session?.user?.admin && (
          <>
            <span>&middot;</span>
            <Link
              prefetch={false}
              href="/admin"
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
