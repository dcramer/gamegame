import LayoutModal from "@/components/layout-modal";
import { Button } from "@/components/ui/button";
import Link from "next/link";

export default async function Page() {
  return (
    <LayoutModal>
      <div className="grid gap-2 text-center">
        <h1 className="text-3xl font-bold">Not Found</h1>
        <p className="text-balance text-muted-foreground">
          The page you are looking for does not exist.
        </p>
      </div>
      <Button asChild>
        <Link href="/">GameGame Home</Link>
      </Button>
    </LayoutModal>
  );
}
