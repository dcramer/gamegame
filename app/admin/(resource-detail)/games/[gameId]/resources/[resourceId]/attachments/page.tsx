import { notFound } from "next/navigation";
import { getResource } from "@/lib/actions/resources";
import { getResourceAttachments } from "@/lib/actions/attachments";
import Link from "next/link";
import { EmptyState } from "@/components/empty-state";

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

  if (attachments.length === 0) {
    return (
      <EmptyState
        title="No attachments yet"
        description="Attachments are extracted from PDF resources when they are processed."
      />
    );
  }

  return (
    <div className="space-y-4">
      <div className="text-sm text-muted-foreground">
        {attachments.length} {attachments.length === 1 ? "attachment" : "attachments"}
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
        {attachments.map((attachment) => (
          <a
            key={attachment.id}
            href={attachment.url}
            target="_blank"
            rel="noopener noreferrer"
            className="group relative aspect-square rounded-lg border border-border bg-card hover:border-primary/50 overflow-hidden transition-colors"
          >
            <img
              src={attachment.url}
              alt={attachment.caption || attachment.originalFilename || "Attachment"}
              className="w-full h-full object-cover"
              loading="lazy"
            />

            {/* Overlay with info */}
            <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/0 to-black/0 opacity-0 group-hover:opacity-100 transition-opacity">
              <div className="absolute bottom-0 left-0 right-0 p-3 text-white">
                {attachment.pageNumber && (
                  <div className="text-xs font-medium mb-1">
                    Page {attachment.pageNumber}
                  </div>
                )}
                {attachment.caption && (
                  <div className="text-xs line-clamp-2">{attachment.caption}</div>
                )}
                {attachment.width && attachment.height && (
                  <div className="text-xs mt-1">
                    {attachment.width} × {attachment.height}
                  </div>
                )}
              </div>
            </div>

            {/* Page number badge (always visible) */}
            {attachment.pageNumber && (
              <div className="absolute top-2 right-2 bg-black/60 text-white text-xs px-2 py-1 rounded">
                p{attachment.pageNumber}
              </div>
            )}
          </a>
        ))}
      </div>
    </div>
  );
}
