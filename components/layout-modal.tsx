import { type ReactNode } from "react";
import Layout from "./layout";

export default function LayoutModal({ children }: { children: ReactNode }) {
  return (
    <Layout>
      <div className="w-full lg:grid lg:min-h-[600px] xl:min-h-[800px]">
        <div className="flex flex-col gap-6 items-center justify-center py-6 lg:py-12">
          {children}
        </div>
      </div>
    </Layout>
  );
}
