"use client";

import FlashMessages from "@/components/flashMessages";

export default function Providers({ children }: { children: React.ReactNode }) {
  return <FlashMessages>{children}</FlashMessages>;
}
