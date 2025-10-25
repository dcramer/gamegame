import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router';
import AdminLayout from '../components/AdminLayout';
import { Button } from '../components/ui/button';
import { Spinner } from '../components/ui/spinner';
import Heading from '../components/Heading';
import { AlertMessage } from '../components/AlertMessage';
import { EmptyState } from '../components/EmptyState';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '../components/ui/table';
import { type Game, gamesListSchema } from '../lib/schemas';

export default function AdminGames() {
  const navigate = useNavigate();
  const [games, setGames] = useState<Game[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const loadGames = async () => {
      try {
        const res = await fetch('/api/games');
        const data = await res.json();
        setGames(gamesListSchema.parse(data));
        setLoading(false);
      } catch (err) {
        console.error('Failed to load games:', err);
        setLoading(false);
      }
    };

    loadGames();
  }, []);

  const handleDelete = async (gameId: string, name: string) => {
    if (!confirm(`Delete ${name}? This will remove all resources.`)) {
      return;
    }

    setError(null);
    try {
      const response = await fetch(`/api/games/${gameId}`, {
        method: 'DELETE',
      });

      if (response.ok) {
        setGames(games.filter((g) => g.id !== gameId));
      } else {
        setError('Failed to delete game. Please try again.');
      }
    } catch (error) {
      console.error('Delete error:', error);
      setError('Failed to delete game. Please try again.');
    }
  };

  if (loading) {
    return (
      <AdminLayout>
        <div className="flex items-center justify-center py-12">
          <Spinner size="lg" />
        </div>
      </AdminLayout>
    );
  }

  return (
    <AdminLayout>
      <div className="flex items-center justify-between mb-6">
        <Heading className="text-3xl">Games</Heading>
        <Button asChild>
          <Link to="/admin/add-game">Add Game</Link>
        </Button>
      </div>

      {error && <AlertMessage variant="error" message={error} onDismiss={() => setError(null)} />}

      {games.length === 0 ? (
        <EmptyState
          title="There are no games"
          description="Start by adding a game."
          action={{ label: 'Add Game', href: '/admin/add-game' }}
        />
      ) : (
        <div className="flex flex-col gap-4">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[88px]">Image</TableHead>
                <TableHead>Name</TableHead>
                <TableHead className="w-[160px] text-center">Actions</TableHead>
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
                    <TableCell>
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
                      <Link to={`/admin/games/${game.id}`} className="hover:underline">
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
                    <TableCell className="text-center">
                      <Button
                        size="sm"
                        variant="destructive"
                        onClick={() => handleDelete(game.id, game.name)}
                      >
                        Delete
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
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
