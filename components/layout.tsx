import Footer from "./footer";
import Header from "./header";

export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen flex flex-col items-stretch">
      <Header />

      <main className="container mx-auto px-4 pb-12 flex-1 relative">{children}</main>

      <Footer />
    </div>
  );
}
