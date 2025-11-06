import { Suspense } from "react";
import Footer from "./footer";
import Header from "./header";
import { getCurrentUser } from "@/lib/session";

async function FooterWithAuth() {
  const user = await getCurrentUser();
  return <Footer isAdmin={user?.isAdmin} />;
}

export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen flex flex-col items-stretch">
      <Header />

      <main className="container mx-auto px-4 pb-12 flex-1 relative">
        {children}
      </main>

      <Suspense fallback={<Footer isAdmin={false} />}>
        <FooterWithAuth />
      </Suspense>
    </div>
  );
}
