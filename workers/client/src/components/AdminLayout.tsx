import { Link } from "react-router-dom";
import { Dices } from "lucide-react";

interface AdminLayoutProps {
  children: React.ReactNode;
}

export default function AdminLayout({ children }: AdminLayoutProps) {
  return (
    <div className="min-h-screen flex flex-col">
      {/* Header */}
      <header className="container mx-auto px-4 py-6 border-b border-border">
        <Link to="/" className="flex items-center space-x-2">
          <Dices className="w-6 h-6" />
          <h1 className="text-xl lg:text-2xl font-bold">
            gamegame <span className="text-sm text-muted-foreground">/ admin</span>
          </h1>
        </Link>
      </header>

      <div className="container mx-auto px-4 py-6">
        <main className="flex-1 min-w-0">{children}</main>
      </div>
    </div>
  );
}
