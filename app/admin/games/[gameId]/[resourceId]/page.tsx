import { notFound } from "next/navigation";
import { getResource } from "@/lib/actions/resources";
import { getResourceAttachments } from "@/lib/actions/attachments";
import { DownloadIcon } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import ResourceForm from "./form";
import AttachmentList from "./attachment-list";

export const maxDuration = 300;

export default async function Page(
  props: {
    params: Promise<{ gameId: string; resourceId: string }>;
  }
) {
  const params = await props.params;
  const resource = await getResource(params.resourceId, true);
  if (!resource) {
    notFound();
  }

  const attachments = await getResourceAttachments(params.resourceId);

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
          {[
            `${resource.embeddingCount.toLocaleString()} chunks`,
            resource.pageCount && `${resource.pageCount} pages`,
            resource.imageCount > 0 && `${resource.imageCount} images`,
            resource.wordCount > 0 && `${(resource.wordCount / 1000).toFixed(1)}k words`,
          ]
            .filter(Boolean)
            .join(" • ")}
        </p>
      </div>

      <ResourceForm resourceId={params.resourceId} initialData={resource} />

      <div className="mt-8">
        <h4 className="text-lg font-semibold mb-4">Media Attachments</h4>
        <AttachmentList attachments={attachments} />
      </div>
    </div>
  );
}
