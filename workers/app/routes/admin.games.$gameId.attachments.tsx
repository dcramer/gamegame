import { useLoaderData, Link, useParams } from 'react-router';
import { z } from 'zod';
import { EmptyState } from '../components/EmptyState';

const attachmentSchema = z.object({
  id: z.string(),
  resourceId: z.string(),
  resourceName: z.string(),
  type: z.string(),
  url: z.string(),
  mimeType: z.string(),
  originalFilename: z.string().nullable(),
  pageNumber: z.number().nullable(),
  caption: z.string().nullable(),
  width: z.number().nullable(),
  height: z.number().nullable(),
  description: z.string().nullable(),
  isGoodQuality: z.boolean().nullable(),
  createdAt: z.string(),
});

const attachmentsListSchema = z.array(attachmentSchema);

export async function loader({ params, context }: any) {
  const { requireAdmin } = await import('../lib/auth');
  await requireAdmin(context.api);

  // Fetch all attachments for the game with resource info
  const response = await context.api.fetch(`/games/${params.gameId}/attachments`);
  if (!response.ok) {
    throw new Error(`Failed to load attachments (${response.status})`);
  }

  const attachmentsData = attachmentsListSchema.parse(await response.json());
  return { attachments: attachmentsData };
}

export default function GameAttachmentsTab() {
  const { gameId } = useParams<{ gameId: string }>();
  const { attachments } = useLoaderData<typeof loader>();

  // Group attachments by resource
  const groupedByResource = attachments.reduce((acc, attachment) => {
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
  }, {} as Record<string, { resourceName: string; resourceId: string; attachments: typeof attachments }>);

  const resources = Object.values(groupedByResource);

  if (attachments.length === 0) {
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
        {attachments.length} {attachments.length === 1 ? 'attachment' : 'attachments'} across {resources.length} {resources.length === 1 ? 'resource' : 'resources'}
      </div>

      {resources.map((resource) => (
        <div key={resource.resourceId} className="space-y-4">
          <h2 className="text-xl font-semibold">
            <Link
              to={`/admin/games/${gameId}/resources/${resource.resourceId}`}
              className="hover:underline"
            >
              {resource.resourceName}
            </Link>
            <span className="text-sm text-muted-foreground font-normal ml-2">
              ({resource.attachments.length} {resource.attachments.length === 1 ? 'attachment' : 'attachments'})
            </span>
          </h2>

          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
            {resource.attachments.map((attachment) => (
              <Link
                key={attachment.id}
                to={`/admin/games/${gameId}/resources/${attachment.resourceId}/attachments/${attachment.id}`}
                className="group relative aspect-square rounded-lg border border-border bg-card hover:border-primary/50 overflow-hidden transition-colors"
              >
                <img
                  src={attachment.url}
                  alt={attachment.caption || attachment.originalFilename || 'Attachment'}
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
                    {attachment.isGoodQuality === false && (
                      <div className="text-xs text-yellow-300 mt-1">⚠ Low quality</div>
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
