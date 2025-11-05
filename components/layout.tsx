import Footer from "./footer";
import Header from "./header";
import { getCurrentUser } from "@/lib/session";

export default async function Layout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();

  return (
    <div className="min-h-screen flex flex-col items-stretch">
      <Header />

      <main className="container mx-auto px-4 pb-12 flex-1 relative">
        {children}
      </main>

      <Footer isAdmin={user?.isAdmin} />
    </div>
  );
}
