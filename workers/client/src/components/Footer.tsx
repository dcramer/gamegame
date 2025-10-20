import { useState, useEffect } from "react";
import { GitHubLogoIcon } from "@radix-ui/react-icons";
import { Dices } from "lucide-react";
import { Link } from "react-router-dom";

const GITHUB_URL = "https://github.com/getsentry/gamegame";

interface User {
  id: string;
  email: string;
  name: string | null;
  isAdmin: boolean;
}

export default function Footer() {
  const [user, setUser] = useState<User | null>(null);

  useEffect(() => {
    fetch('/api/auth/me')
      .then(async (res) => {
        if (res.ok) {
          const data = await res.json();
          setUser(data);
        }
      })
      .catch(() => {
        // Not authenticated, ignore
      });
  }, []);

  return (
    <footer className="container mx-auto px-4 py-8 text-center text-muted-foreground font-mono text-xs">
      <div className="flex justify-center items-center gap-4">
        <a
          href={GITHUB_URL}
          className="flex items-center gap-1 hover:underline"
          target="_blank"
          rel="noopener noreferrer"
        >
          <GitHubLogoIcon className="w-4 h-4" />
          GitHub
        </a>
        <span>&middot;</span>
        <Link
          to="/"
          className="flex items-center gap-1 hover:underline"
        >
          <Dices className="w-4 h-4" />
          GameGame
        </Link>
        {user?.isAdmin && (
          <>
            <span>&middot;</span>
            <Link
              to="/admin"
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
