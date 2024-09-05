import { notFound } from "next/navigation";
import { getResource } from "@/lib/actions/resources";
import { DownloadIcon } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";

export default async function Page({
  params,
}: {
  params: { gameId: string; resourceId: string };
}) {
  const resource = await getResource(params.resourceId);
  if (!resource) {
    notFound();
  }

  return (
    <div>
      <h3 className="text-2xl text-muted-foreground font-semibold mb-4">
        {resource.name}
      </h3>
      <Button asChild>
        <Link href={resource.url} prefetch={false}>
          <DownloadIcon className="h-8 w-8" />
        </Link>
      </Button>
    </div>
  );
}
