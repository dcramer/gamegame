import { useState } from 'react';
import { Link, useNavigate, useLoaderData } from 'react-router';
import { Trash2 } from 'lucide-react';
import AdminLayout from '../components/AdminLayout';
import { Button } from '../components/ui/button';
import { PageHeader } from '../components/PageHeader';
import { useFlashNotifications } from '../hooks/useFlashNotifications';
import { EmptyState } from '../components/EmptyState';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '../components/ui/tooltip';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '../components/ui/table';
import { type Game, gamesListSchema } from '../lib/schemas';
import { apiClient } from '../../load-context';
import type { Route } from './+types/admin';
import { createMeta, createAdminTitle } from '../lib/meta';

export const meta = () => {
  return createMeta({
    title: createAdminTitle('Games'),
    description: "Manage board games, upload rulebooks, and configure game resources.",
    noIndex: true, // Don't index admin pages
  });
};

export async function loader({ context }: Route.LoaderArgs) {
  const { requireAdmin } = await import('../lib/auth');
  await requireAdmin(context.api);

  const res = await context.api.fetch('/games');
  if (!res.ok) {
    throw new Error('Failed to load games');
  }
  const data = await res.json();
  const games = gamesListSchema.parse(data);
  return { games };
}

export default function AdminGames() {
  const navigate = useNavigate();
  const { games: initialGames } = useLoaderData<typeof loader>();
  const [games, setGames] = useState<Game[]>(initialGames);
  const { addToast } = useFlashNotifications();

  const handleDelete = async (gameId: string, name: string) => {
    if (!confirm(`Delete "${name}"?\n\nThis will permanently delete:\n- The game\n- All resources\n- All fragments and embeddings\n- All associated files\n\nThis action cannot be undone.`)) {
      return;
    }

    try {
      const response = await apiClient.fetch(`/games/${gameId}`, {
        method: 'DELETE',
      });

      if (response.ok) {
        setGames(games.filter((g) => g.id !== gameId));
        addToast('success', `Deleted ${name} successfully!`);
      } else {
        addToast('error', 'Failed to delete game. Please try again.');
      }
    } catch (error) {
      console.error('Delete error:', error);
      addToast('error', 'Failed to delete game. Please try again.');
    }
  };

  return (
    <AdminLayout>
      <PageHeader
        breadcrumbs={[{ label: 'Admin' }]}
        title="Games"
        actions={
          <Button asChild>
            <Link to="/admin/add-game">Add Game</Link>
          </Button>
        }
      />

      {games.length === 0 ? (
        <EmptyState
          title="There are no games"
          description="Start by adding a game."
          action={{ label: 'Add Game', href: '/admin/add-game' }}
        />
      ) : (
        <div className="flex flex-col gap-4">
          <TooltipProvider>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[88px]">Image</TableHead>
                  <TableHead>Name</TableHead>
                  <TableHead className="w-[60px] text-center">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {games.map((game) => {
                  const hasResources = (game.resourceCount || 0) > 0;

                  return (
                    <TableRow
                      key={game.id}
                      className="cursor-pointer hover:bg-muted/50"
                      onClick={() => navigate(`/admin/games/${game.id}`)}
                    >
                      <TableCell className="align-middle">
                        <Link to={`/admin/games/${game.id}`}>
                          {game.imageUrl ? (
                            <img
                              src={game.imageUrl}
                              alt={game.name}
                              className="w-16 h-16 object-cover rounded bg-muted"
                            />
                          ) : (
                            <div className="w-16 h-16 rounded bg-muted flex items-center justify-center text-xs text-muted-foreground">
                              No image
                            </div>
                          )}
                        </Link>
                      </TableCell>
                      <TableCell className="font-medium align-middle">
                        <Link to={`/admin/games/${game.id}`} className="hover:underline text-lg">
                          {game.name}
                        </Link>
                        {game.bggUrl && (
                          <div className="text-xs text-muted-foreground mt-1">
                            <a href={game.bggUrl} target="_blank" rel="noreferrer" className="hover:underline">
                              {game.bggUrl}
                            </a>
                          </div>
                        )}
                        {!hasResources && (
                          <div className="text-xs text-red-500 mt-1">No resources yet</div>
                        )}
                      </TableCell>
                      <TableCell className="text-center align-middle">
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-8 w-8 p-0"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleDelete(game.id, game.name);
                              }}
                            >
                              <Trash2 className="h-4 w-4 text-red-500" />
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>Delete game</TooltipContent>
                        </Tooltip>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </TooltipProvider>
          <div className="self-end">
            <Button asChild variant="secondary" size="sm">
              <Link to="/admin/add-game">Add Game</Link>
            </Button>
          </div>
        </div>
      )}
    </AdminLayout>
  );
}
