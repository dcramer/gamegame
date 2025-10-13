"use client";

import FlashMessages from "@/components/flashMessages";
import ProcessingProvider from "@/components/processing-provider";

export default function Providers({ children }: { children: React.ReactNode }) {
  return (
    <FlashMessages>
      <ProcessingProvider>{children}</ProcessingProvider>
    </FlashMessages>
  );
}
