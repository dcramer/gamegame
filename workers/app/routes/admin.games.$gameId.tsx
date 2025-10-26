import { useParams, useNavigate, useLoaderData, Outlet, useLocation } from 'react-router';
import { RefreshCw, Trash2 } from 'lucide-react';
import AdminLayout from '../components/AdminLayout';
import { PageHeader } from '../components/PageHeader';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '../components/ui/tabs';
import { ActionButton } from '../components/ui/action-button';
import { useFlashNotifications } from '../hooks/useFlashNotifications';
import {
  gameSchema,
  resourceSchema,
  uploadResponseSchema,
  deleteGameResponseSchema,
} from '../lib/schemas';
import { z } from 'zod';
import { apiClient } from '../../load-context';
import type { Route } from './+types/admin.games.$gameId';
import { createMeta, createAdminTitle } from '../lib/meta';

export const meta = ({ data }: Route.MetaArgs) => {
  if (!data?.game) {
    return createMeta({
      title: createAdminTitle('Game Not Found'),
      noIndex: true,
    });
  }

  return createMeta({
    title: createAdminTitle(data.game.name),
    description: `Manage resources and settings for ${data.game.name}.`,
    noIndex: true,
  });
};

export async function loader({ params, context }: Route.LoaderArgs) {
  const { requireAdmin } = await import('../lib/auth');
  await requireAdmin(context.api);

  const gameResponse = await context.api.fetch(`/games/${params.gameId}`);
  if (!gameResponse.ok) {
    if (gameResponse.status === 404) {
      throw new Response('Game not found', { status: 404 });
    }
    throw new Error(`Failed to load game (${gameResponse.status})`);
  }

  const gameData = gameSchema.parse(await gameResponse.json());

  const resourcesResponse = await context.api.fetch(`/games/${params.gameId}/resources`);
  if (!resourcesResponse.ok) {
    throw new Error(`Failed to load resources (${resourcesResponse.status})`);
  }
  const extendedResourcesListSchema = z.array(resourceSchema.extend({
    status: z.string().optional(),
    processingStage: z.string().optional(),
    currentJobId: z.string().nullable().optional(),
    originalFilename: z.string().optional(),
    description: z.string().nullable().optional(),
    author: z.string().nullable().optional(),
    attributionUrl: z.string().nullable().optional(),
  }));
  const resourcesData = extendedResourcesListSchema.parse(await resourcesResponse.json());

  return { game: gameData, resources: resourcesData };
}

export default function AdminGameLayout() {
  const { gameId } = useParams<{ gameId: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const { game, resources } = useLoaderData<typeof loader>();

  // Flash notifications for feedback
  const { addJobNotification, addToast } = useFlashNotifications();

  // Determine active tab from URL
  const isAttachmentsTab = location.pathname.endsWith('/attachments');
  const isResourcesTab = location.pathname.endsWith('/resources');
  const activeTab = isAttachmentsTab ? 'attachments' : isResourcesTab ? 'resources' : 'details';

  const handleReprocessAll = async () => {
    if (!confirm(`Reprocess all ${resources.length} resources for "${game.name}"?\n\nThis will re-extract PDFs, re-analyze images, and re-embed all content.`)) {
      return;
    }

    try {
      let successCount = 0;
      let failCount = 0;

      for (const resource of resources) {
        const response = await apiClient.fetch(`/resources/${resource.id}/reprocess`, {
          method: 'POST',
        });

        if (response.ok) {
          const data = uploadResponseSchema.parse(await response.json());
          addJobNotification(data.jobId, 'Full Reprocess', `Reprocessing ${resource.name}`);
          successCount++;
        } else {
          failCount++;
        }
      }

      if (failCount === 0) {
        addToast('success', `Reprocessing ${successCount} ${successCount === 1 ? 'resource' : 'resources'}`);
      } else {
        addToast('warning', `Started ${successCount} jobs, ${failCount} failed`);
      }
    } catch (error) {
      console.error('Reprocess all error:', error);
      addToast('error', 'Failed to reprocess resources');
    }
  };

  const handleSyncFromBGG = async () => {
    if (!game.bggId) {
      addToast('error', 'This game does not have a BGG ID');
      return;
    }

    try {
      const response = await apiClient.fetch(`/games/${gameId}/sync-from-bgg`, {
        method: 'POST',
      });

      if (response.ok) {
        addToast('success', `Synced ${game.name} from BoardGameGeek`);
        // Reload the page to show updated data
        window.location.reload();
      } else {
        const errorData = await response.json().catch(() => ({ error: 'Unknown error' })) as { error?: string };
        addToast('error', `Failed to sync from BGG: ${errorData.error || 'Unknown error'}`);
      }
    } catch (error) {
      console.error('Sync from BGG error:', error);
      addToast('error', 'Failed to sync from BoardGameGeek. Please try again.');
    }
  };

  const handleDeleteGame = async () => {
    if (!confirm(`Delete "${game.name}"?\n\nThis will permanently delete:\n- The game\n- All resources\n- All fragments and embeddings\n- All associated files\n\nThis action cannot be undone.`)) return;

    try {
      const response = await apiClient.fetch(`/games/${gameId}`, {
        method: 'DELETE',
      });

      if (response.ok) {
        const data = deleteGameResponseSchema.parse(await response.json());

        // Show warning if there were cleanup errors
        if (data.warnings && data.warnings.length > 0) {
          addToast('warning', `Game deleted, but some cleanup operations failed: ${data.warnings.join(', ')}`, 5000);
          // Still redirect after showing warning
          setTimeout(() => navigate('/admin/games'), 3000);
        } else {
          addToast('success', `Deleted ${game.name}`);
          // Redirect to admin games page immediately
          navigate('/admin/games');
        }
      } else {
        const errorData = await response.json().catch(() => ({ error: 'Unknown error' })) as { error?: string };
        addToast('error', `Failed to delete game: ${errorData.error || 'Unknown error'}`);
      }
    } catch (error) {
      console.error('Delete game error:', error);
      addToast('error', 'Failed to delete game. Please try again.');
    }
  };

  return (
    <AdminLayout>
      <PageHeader
        breadcrumbs={[
          { label: 'Admin', href: '/admin' },
          { label: 'Games', href: '/admin' },
          { label: game.name },
        ]}
        title={game.name}
        stats={resources.length > 0 ? `${resources.length} ${resources.length === 1 ? 'resource' : 'resources'}` : undefined}
      />

      <Tabs>
        <TabsList className="mb-8 -mx-4 px-4">
          <TabsTrigger
            active={activeTab === 'details'}
            onClick={() => navigate(`/admin/games/${gameId}`)}
          >
            Details
          </TabsTrigger>
          <TabsTrigger
            active={activeTab === 'resources'}
            onClick={() => navigate(`/admin/games/${gameId}/resources`)}
          >
            Resources
          </TabsTrigger>
          <TabsTrigger
            active={activeTab === 'attachments'}
            onClick={() => navigate(`/admin/games/${gameId}/attachments`)}
          >
            Attachments
          </TabsTrigger>
        </TabsList>

        <div className="grid grid-cols-1 lg:grid-cols-[1fr,380px] gap-8">
          {/* Left column - Content */}
          <div>
            <TabsContent className="mt-0">
              <Outlet context={{ game, resources }} />
            </TabsContent>
          </div>

          {/* Right column - Actions sidebar */}
          <div className="lg:sticky lg:top-8 lg:self-start space-y-8">
            {resources.length > 0 && (
              <div>
                <h3 className="text-sm font-semibold mb-3">Reprocessing</h3>
                <ActionButton
                  icon={RefreshCw}
                  title="Reprocess All Resources"
                  description={`Re-extract all PDFs, re-analyze images, and re-embed content for all ${resources.length} ${resources.length === 1 ? 'resource' : 'resources'}`}
                  onClick={handleReprocessAll}
                />
              </div>
            )}

            {game.bggId && (
              <div>
                <h3 className="text-sm font-semibold mb-3">BoardGameGeek</h3>
                <ActionButton
                  icon={RefreshCw}
                  title="Sync from BGG"
                  description="Update game name, year, and image from BoardGameGeek"
                  onClick={handleSyncFromBGG}
                />
              </div>
            )}

            <div>
              <h3 className="text-sm font-semibold mb-3">Danger Zone</h3>
              <ActionButton
                icon={Trash2}
                title="Delete Game"
                description="Permanently delete this game and all associated resources"
                onClick={handleDeleteGame}
                variant="danger"
              />
            </div>
          </div>
        </div>
      </Tabs>
    </AdminLayout>
  );
}
