import type { Metadata } from "next";
import { Comfortaa } from "next/font/google";
import "./globals.css";
import { cn } from "@/lib/utils";
import Providers from "./providers";
import InstallPrompt from "@/components/installPrompt";

const comfortaa = Comfortaa({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "GameGame",
  description: "Stop reading the rules, and ask the AI.",
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
        <Providers>{children}</Providers>

        <InstallPrompt />
      </body>
    </html>
  );
}
