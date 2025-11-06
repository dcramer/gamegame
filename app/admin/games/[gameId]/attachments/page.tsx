import { serverClient } from "@/lib/procedures/client.server";
import { notFound } from "next/navigation";
import Link from "next/link";
import { EmptyState } from "@/components/empty-state";
import { requireAdmin } from "@/lib/session";
import { db } from "@/lib/db";
import { resources, attachments } from "@/lib/db/schema";
import { eq, asc } from "drizzle-orm";
import { blobKeyToUrl } from "@/lib/services/blob-storage";

export const maxDuration = 300;

interface Attachment {
  id: string;
  resourceId: string;
  resourceName: string;
  type: string;
  blobKey: string;
  url: string;
  mimeType: string;
  originalFilename: string | null;
  pageNumber: number | null;
  caption: string | null;
  width: number | null;
  height: number | null;
  description: string | null;
  isGoodQuality: boolean | null;
  createdAt: number;
}

interface GroupedResource {
  resourceName: string;
  resourceId: string;
  attachments: Attachment[];
}

async function getGameAttachments(gameId: string): Promise<Attachment[]> {
  // Get attachments for this game with resource names
  const attachmentsList = await db
    .select({
      id: attachments.id,
      resourceId: attachments.resourceId,
      resourceName: resources.name,
      type: attachments.type,
      blobKey: attachments.blobKey,
      mimeType: attachments.mimeType,
      originalFilename: attachments.originalFilename,
      pageNumber: attachments.pageNumber,
      caption: attachments.caption,
      width: attachments.width,
      height: attachments.height,
      description: attachments.description,
      isGoodQuality: attachments.isGoodQuality,
      createdAt: attachments.createdAt,
    })
    .from(attachments)
    .innerJoin(resources, eq(attachments.resourceId, resources.id))
    .where(eq(attachments.gameId, gameId))
    .orderBy(asc(resources.name), asc(attachments.pageNumber), asc(attachments.createdAt));

  // Convert to proper format
  return attachmentsList.map((attachment) => ({
    ...attachment,
    url: attachment.blobKey ? blobKeyToUrl(attachment.blobKey) : "",
    isGoodQuality: attachment.isGoodQuality === "good" ? true : attachment.isGoodQuality === "bad" ? false : null,
  }));
}

export default async function AttachmentsPage(props: { params: Promise<{ gameId: string }> }) {
  await requireAdmin();

  const params = await props.params;

  let game;
  try {
    game = await serverClient.games.get({ idOrSlug: params.gameId });
  } catch (error) {
    notFound();
  }

  const attachmentsList = await getGameAttachments(game.id);

  // Group attachments by resource
  const groupedByResource = attachmentsList.reduce((acc, attachment) => {
    const key = attachment.resourceId;
    if (!acc[key]) {
      acc[key] = {
        resourceName: attachment.resourceName,
        resourceId: attachment.resourceId,
        attachments: [],
      };
    }
    acc[key].attachments.push(attachment);
    return acc;
  }, {} as Record<string, GroupedResource>);

  const groupedResources = Object.values(groupedByResource);

  if (attachmentsList.length === 0) {
    return (
      <EmptyState
        title="No attachments yet"
        description="Attachments are extracted from PDF resources when they are processed."
      />
    );
  }

  return (
    <div className="space-y-8">
      <div className="text-sm text-muted-foreground">
        {attachmentsList.length} {attachmentsList.length === 1 ? "attachment" : "attachments"} across {groupedResources.length} {groupedResources.length === 1 ? "resource" : "resources"}
      </div>

      {groupedResources.map((resource) => (
        <div key={resource.resourceId} className="space-y-4">
          <h2 className="text-xl font-semibold">
            <Link
              href={`/admin/games/${game.id}/resources/${resource.resourceId}`}
              className="hover:underline"
            >
              {resource.resourceName}
            </Link>
            <span className="text-sm text-muted-foreground font-normal ml-2">
              ({resource.attachments.length} {resource.attachments.length === 1 ? "attachment" : "attachments"})
            </span>
          </h2>

          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
            {resource.attachments.map((attachment) => (
              <Link
                key={attachment.id}
                href={`/admin/games/${game.id}/attachments/${attachment.id}`}
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
                    {attachment.isGoodQuality !== null && (
                      <div className="text-xs font-medium">
                        Quality: {attachment.isGoodQuality ? '✓ Good' : '✗ Low'}
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
      ))}
    </div>
  );
}
