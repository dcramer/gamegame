import type { Metadata, Viewport } from "next";
import { Comfortaa } from "next/font/google";
import "./globals.css";
import { cn } from "@/lib/utils";
import Providers from "./providers";
import Fathom from "@/components/fathom";

const comfortaa = Comfortaa({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "GameGame",
  description: "Stop reading the rules, and ask the AI.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1.0,
  userScalable: false,
  themeColor: "#000000",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={cn("bg-background text-foreground", comfortaa.className)}
      >
        <Fathom />
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
