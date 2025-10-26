import { Link, useLocation } from "react-router";
import { Dices } from "lucide-react";
import Footer from "./Footer";

interface AdminLayoutProps {
  children: React.ReactNode;
}

export default function AdminLayout({ children }: AdminLayoutProps) {
  const location = useLocation();

  const isActive = (path: string) => {
    if (path === '/admin') {
      // Games tab is active for /admin, /admin/games/*, and /admin/add-game
      return (
        location.pathname === '/admin' ||
        location.pathname.startsWith('/admin/games') ||
        location.pathname.startsWith('/admin/add-game')
      );
    }
    // Jobs tab is active for /admin/jobs and sub-paths
    return location.pathname.startsWith(path);
  };

  return (
    <div className="min-h-screen flex flex-col">
      {/* Header */}
      <header className="border-b border-border">
        <div className="container mx-auto px-4 py-6">
          <Link to="/" className="flex items-center space-x-2">
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
              to="/admin"
              className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
                isActive('/admin')
                  ? 'border-primary text-foreground'
                  : 'border-transparent text-muted-foreground hover:text-foreground hover:border-border'
              }`}
            >
              Games
            </Link>
            <Link
              to="/admin/jobs"
              className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
                isActive('/admin/jobs')
                  ? 'border-primary text-foreground'
                  : 'border-transparent text-muted-foreground hover:text-foreground hover:border-border'
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

      <Footer />
    </div>
  );
}
