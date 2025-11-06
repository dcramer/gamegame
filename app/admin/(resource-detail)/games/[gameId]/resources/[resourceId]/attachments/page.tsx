import { notFound } from "next/navigation";
import { serverClient } from "@/lib/procedures/client.server";
import Link from "next/link";
import { EmptyState } from "@/components/empty-state";

export const maxDuration = 300;

export default async function Page(
  props: {
    params: Promise<{ gameId: string; resourceId: string }>;
  }
) {
  const params = await props.params;

  // Fetch resource and attachments using oRPC server client
  let resource, attachments;
  try {
    [resource, attachments] = await Promise.all([
      serverClient.resources.get({ id: params.resourceId }),
      serverClient.attachments.listForResource({ resourceId: params.resourceId }),
    ]);
  } catch (error) {
    notFound();
  }

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
          <Link
            key={attachment.id}
            href={`/admin/games/${params.gameId}/attachments/${attachment.id}`}
            className="group relative aspect-square rounded-lg border border-border bg-card hover:border-primary/50 overflow-hidden transition-colors"
          >
            <img
              src={attachment.url}
              alt={attachment.caption || attachment.originalFilename || "Attachment"}
              className="w-full h-full object-cover"
              loading="lazy"
            />

            {/* Overlay with info */}
            <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/20 to-black/20 opacity-0 group-hover:opacity-100 transition-opacity">
              <div className="absolute bottom-0 left-0 right-0 p-3 text-white space-y-1">
                {attachment.pageNumber && (
                  <div className="text-xs font-medium">
                    Page {attachment.pageNumber}
                  </div>
                )}
                {attachment.isGoodQuality && (
                  <div className="text-xs font-medium">
                    Quality: {attachment.isGoodQuality === 'good' ? '✓ Good' : '✗ Low'}
                  </div>
                )}
                {attachment.caption && (
                  <div className="text-xs line-clamp-2">{attachment.caption}</div>
                )}
                {attachment.width && attachment.height && (
                  <div className="text-xs">
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
          </Link>
        ))}
      </div>
    </div>
  );
}
