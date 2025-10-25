import { useParams, useNavigate, useLocation, useLoaderData, Outlet } from 'react-router';
import { Download, RefreshCw, Trash2 } from 'lucide-react';
import AdminLayout from '../components/AdminLayout';
import { PageHeader } from '../components/PageHeader';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '../components/ui/tabs';
import { useFlashNotifications } from '../hooks/useFlashNotifications';
import { resourceSchema, attachmentsListSchema } from '../lib/schemas';
import { z } from 'zod';
import { apiClient } from '../../load-context';
import type { Route } from './+types/admin.games.$gameId.resources.$resourceId';
import { createMeta, createAdminTitle } from '../lib/meta';
import { useNotifications } from '../contexts/NotificationContext';

export const meta = ({ data }: Route.MetaArgs) => {
  if (!data?.resource) {
    return createMeta({
      title: createAdminTitle('Resource Not Found'),
      noIndex: true,
    });
  }

  return createMeta({
    title: createAdminTitle(data.resource.name, data.game.name),
    description: `Manage ${data.resource.name} for ${data.game.name}.`,
    noIndex: true,
  });
};

// Extended Resource schema with additional UI fields
export const extendedResourceSchema = resourceSchema.extend({
  originalFilename: z.string().optional(),
  description: z.string().nullable().optional(),
  author: z.string().nullable().optional(),
  attributionUrl: z.string().nullable().optional(),
  content: z.string().optional(),
  // createdAt and updatedAt already defined in base schema as coerced numbers
});

export async function loader({ params, context }: Route.LoaderArgs) {
  const [resourceRes, attachmentsRes, gameRes] = await Promise.all([
    context.api.fetch(`/resources/${params.resourceId}`),
    context.api.fetch(`/resources/${params.resourceId}/attachments`),
    context.api.fetch(`/games/${params.gameId}`),
  ]);

  if (!resourceRes.ok) throw new Error('Resource not found');
  if (!attachmentsRes.ok) throw new Error('Failed to load attachments');
  if (!gameRes.ok) throw new Error('Game not found');

  const [resourceJson, attachmentsJson, gameJson] = await Promise.all([
    resourceRes.json(),
    attachmentsRes.json(),
    gameRes.json(),
  ]);

  const resource = extendedResourceSchema.parse(resourceJson);
  const attachments = attachmentsListSchema.parse(attachmentsJson);
  const game = gameJson as { name: string };

  return { resource, attachments, game };
}

export default function AdminResourceLayout() {
  const { gameId, resourceId } = useParams<{ gameId: string; resourceId: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const { resource, attachments, game } = useLoaderData<typeof loader>();

  // Flash notifications for feedback
  const { addToast, addPendingJobNotification, updatePendingJobWithId } = useFlashNotifications();
  const { removeNotification } = useNotifications();

  // Determine active tab from URL
  const isAttachmentsTab = location.pathname.endsWith('/attachments');
  const activeTab = isAttachmentsTab ? 'attachments' : 'details';

  const handleReprocess = async (from: 'ingest' | 'vision' | 'cleanup' | 'metadata' | 'embed' = 'cleanup') => {
    // Map 'from' parameter to user-friendly titles and descriptions
    const jobTitles = {
      ingest: { title: 'Full Reprocess', description: 'Complete pipeline from scratch' },
      vision: { title: 'Improve Image Descriptions', description: 'Re-analyzing image content' },
      cleanup: { title: 'Clean Up Markdown', description: 'Fixing formatting issues' },
      metadata: { title: 'Regenerate Metadata', description: 'Updating document title and description' },
      embed: { title: 'Regenerate Embeddings', description: 'Updating search index' },
    };
    const { title, description } = jobTitles[from];

    // Create the notification immediately for instant feedback
    const notificationId = addPendingJobNotification(title, description);

    try {
      const url = from === 'ingest'
        ? `/resources/${resourceId}/reprocess`
        : `/resources/${resourceId}/reprocess?from=${from}`;

      const response = await apiClient.fetch(url, {
        method: 'POST',
      });

      if (response.ok) {
        const data = await response.json() as { jobId?: string; message?: string };
        if (data.jobId) {
          // Update the pending notification with the actual job ID to start polling
          updatePendingJobWithId(notificationId, data.jobId);
        } else {
          // No job ID returned, remove the pending notification and show success toast
          removeNotification(notificationId);
          addToast('success', data.message || 'Resource queued for reprocessing.');
        }
      } else {
        // Request failed, remove the pending notification and show error
        removeNotification(notificationId);
        const error = await response.json() as { error?: string };
        addToast('error', error.error || 'Failed to reprocess resource');
      }
    } catch (error) {
      console.error('Reprocess error:', error);
      // Exception thrown, remove the pending notification and show error
      removeNotification(notificationId);
      addToast('error', 'Failed to reprocess resource');
    }
  };

  const handleDelete = async () => {
    if (!confirm(`Are you sure you want to delete "${resource.name}"? This action cannot be undone.`)) {
      return;
    }

    try {
      const response = await apiClient.fetch(`/resources/${resourceId}`, {
        method: 'DELETE',
      });

      if (response.ok) {
        addToast('success', 'Resource deleted successfully');
        // Navigate back to game page
        navigate(`/admin/games/${gameId}`);
      } else {
        const error = await response.json() as { error?: string };
        addToast('error', error.error || 'Failed to delete resource');
      }
    } catch (error) {
      console.error('Delete error:', error);
      addToast('error', 'Failed to delete resource');
    }
  };

  const stats = [
    typeof resource.fragmentCount === 'number' ? `${resource.fragmentCount.toLocaleString()} chunks` : null,
    typeof resource.pageCount === 'number' ? `${resource.pageCount} pages` : null,
    resource.imageCount > 0 ? `${resource.imageCount} images` : null,
    resource.wordCount > 0 ? `${(resource.wordCount / 1000).toFixed(1)}k words` : null,
  ]
    .filter(Boolean)
    .join(' • ');

  return (
    <AdminLayout>
      <PageHeader
        breadcrumbs={[
          { label: 'Admin', href: '/admin' },
          { label: 'Games', href: '/admin' },
          { label: game.name, href: `/admin/games/${gameId}` },
          { label: resource.name },
        ]}
        title={resource.name}
        stats={stats}
      />

      <Tabs>
        <TabsList className="mb-8 -mx-4 px-4">
          <TabsTrigger
            active={activeTab === 'details'}
            onClick={() => navigate(`/admin/games/${gameId}/resources/${resourceId}`)}
          >
            Details
          </TabsTrigger>
          <TabsTrigger
            active={activeTab === 'attachments'}
            onClick={() => navigate(`/admin/games/${gameId}/resources/${resourceId}/attachments`)}
          >
            Attachments
          </TabsTrigger>
        </TabsList>

        <div className="grid grid-cols-1 lg:grid-cols-[1fr,380px] gap-8">
          {/* Left column - Content */}
          <div>
            <TabsContent className="mt-0">
              <Outlet context={{ resource, attachments }} />
            </TabsContent>
          </div>

          {/* Right column - Actions sidebar */}
          <div className="lg:sticky lg:top-8 lg:self-start space-y-8">
            <div>
              <h3 className="text-sm font-semibold mb-3">Reprocessing</h3>
              <div className="space-y-2">
                <button
                  onClick={() => handleReprocess('ingest')}
                  className="w-full text-left p-3 rounded-lg border border-border bg-card hover:bg-accent hover:border-accent-foreground/20 transition-colors group"
                >
                  <div className="flex items-start gap-3">
                    <RefreshCw className="h-4 w-4 mt-0.5 text-muted-foreground group-hover:text-foreground" />
                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-sm mb-1">Full Reprocess</div>
                      <div className="text-xs text-muted-foreground leading-relaxed">
                        Complete pipeline from scratch
                      </div>
                    </div>
                  </div>
                </button>

                <button
                  onClick={() => handleReprocess('vision')}
                  className="w-full text-left p-3 rounded-lg border border-border bg-card hover:bg-accent hover:border-accent-foreground/20 transition-colors group"
                >
                  <div className="flex items-start gap-3">
                    <RefreshCw className="h-4 w-4 mt-0.5 text-muted-foreground group-hover:text-foreground" />
                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-sm mb-1">Improve Image Descriptions</div>
                      <div className="text-xs text-muted-foreground leading-relaxed">
                        Re-analyze image content
                      </div>
                    </div>
                  </div>
                </button>

                <button
                  onClick={() => handleReprocess('cleanup')}
                  className="w-full text-left p-3 rounded-lg border border-border bg-card hover:bg-accent hover:border-accent-foreground/20 transition-colors group"
                >
                  <div className="flex items-start gap-3">
                    <RefreshCw className="h-4 w-4 mt-0.5 text-muted-foreground group-hover:text-foreground" />
                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-sm mb-1">Clean Up Markdown</div>
                      <div className="text-xs text-muted-foreground leading-relaxed">
                        Fix formatting issues
                      </div>
                    </div>
                  </div>
                </button>

                <button
                  onClick={() => handleReprocess('metadata')}
                  className="w-full text-left p-3 rounded-lg border border-border bg-card hover:bg-accent hover:border-accent-foreground/20 transition-colors group"
                >
                  <div className="flex items-start gap-3">
                    <RefreshCw className="h-4 w-4 mt-0.5 text-muted-foreground group-hover:text-foreground" />
                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-sm mb-1">Regenerate Metadata</div>
                      <div className="text-xs text-muted-foreground leading-relaxed">
                        Update document title and description
                      </div>
                    </div>
                  </div>
                </button>

                <button
                  onClick={() => handleReprocess('embed')}
                  className="w-full text-left p-3 rounded-lg border border-border bg-card hover:bg-accent hover:border-accent-foreground/20 transition-colors group"
                >
                  <div className="flex items-start gap-3">
                    <RefreshCw className="h-4 w-4 mt-0.5 text-muted-foreground group-hover:text-foreground" />
                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-sm mb-1">Regenerate Embeddings</div>
                      <div className="text-xs text-muted-foreground leading-relaxed">
                        Update search index
                      </div>
                    </div>
                  </div>
                </button>
              </div>
            </div>

            <div>
              <h3 className="text-sm font-semibold mb-3">Download</h3>
              <a
                href={resource.url}
                target="_blank"
                rel="noopener noreferrer"
                className="block w-full text-left p-3 rounded-lg border border-border bg-card hover:bg-accent hover:border-accent-foreground/20 transition-colors group"
              >
                <div className="flex items-start gap-3">
                  <Download className="h-4 w-4 mt-0.5 text-muted-foreground group-hover:text-foreground" />
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-sm mb-1">Download Resource</div>
                    <div className="text-xs text-muted-foreground leading-relaxed">
                      Get the original source file
                    </div>
                  </div>
                </div>
              </a>
            </div>

            <div>
              <h3 className="text-sm font-semibold mb-3">Danger Zone</h3>
              <button
                onClick={handleDelete}
                className="w-full text-left p-3 rounded-lg border border-red-500/50 bg-card hover:bg-red-500/10 hover:border-red-500 transition-colors group"
              >
                <div className="flex items-start gap-3">
                  <Trash2 className="h-4 w-4 mt-0.5 text-red-500" />
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-sm mb-1 text-red-500">Delete Resource</div>
                    <div className="text-xs text-muted-foreground leading-relaxed">
                      Permanently removes all data
                    </div>
                  </div>
                </div>
              </button>
            </div>
          </div>
        </div>
      </Tabs>
    </AdminLayout>
  );
}
