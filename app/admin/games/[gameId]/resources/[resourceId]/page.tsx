import { notFound } from "next/navigation";
import { getResource } from "@/lib/actions/resources";
import { DownloadIcon } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import ResourceForm from "./form";

export default async function Page({
  params,
}: {
  params: { gameId: string; resourceId: string };
}) {
  const resource = await getResource(params.resourceId, true);
  if (!resource) {
    notFound();
  }

  return (
    <div>
      <div className="flex flex-col gap-2 mb-6">
        <div className="flex items-center gap-4">
          <h3 className="text-2xl font-semibold">{resource.name}</h3>
          <Button asChild size="sm" variant="ghost">
            <Link href={resource.url} prefetch={false}>
              <DownloadIcon className="h-5 w-5" />
            </Link>
          </Button>
        </div>
        <p className="text-muted-foreground text-sm">
          {resource.embeddingCount.toLocaleString()} chunks
        </p>
      </div>

      <ResourceForm resourceId={params.resourceId} initialData={resource} />
    </div>
  );
}
