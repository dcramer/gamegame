import { GitHubLogoIcon } from "@radix-ui/react-icons";
import Link from "next/link";

export default function Footer() {
  return (
    <footer className="container mx-auto px-4 py-8 text-center text-muted-foreground font-mono text-xs">
      <p className="flex items-center justify-center gap-2">
        <Link
          prefetch={false}
          href="https://github.com/dcramer/gamegame"
          className="flex items-center gap-1 hover:underline"
        >
          <GitHubLogoIcon className="w-4 h-4" />
          GitHub
        </Link>
      </p>
    </footer>
  );
}
