import Footer from "./footer";
import Header from "./header";

export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-gradient-to-b from-gray-100 to-white">
      <Header />

      <main className="container mx-auto px-4 pb-12">{children}</main>

      <Footer />
    </div>
  );
}
