import { type ReactNode } from "react";
import Layout from "./layout";

export default function LayoutModal({ children }: { children: ReactNode }) {
  return (
    <Layout>
      <div className="w-full flex-1 flex items-center justify-center">
        <div className="flex flex-col gap-6 items-center justify-center py-2 lg:py-6">
          {children}
        </div>
      </div>
    </Layout>
  );
}
