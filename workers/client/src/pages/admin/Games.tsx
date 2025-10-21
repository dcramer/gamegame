import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import AdminLayout from '../../components/AdminLayout';
import { Button } from '../../components/ui/button';
import { Spinner } from '../../components/ui/spinner';
import Heading from '../../components/Heading';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '../../components/ui/table';

interface Game {
  id: string;
  name: string;
  slug: string;
  year?: number | null;
  imageUrl: string | null;
  bggUrl: string | null;
  resourceCount?: number;
}

export default function AdminGames() {
  const [games, setGames] = useState<Game[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/games')
      .then((res) => res.json())
      .then((data) => {
        setGames(data);
        setLoading(false);
      })
      .catch((err) => {
        console.error('Failed to load games:', err);
        setLoading(false);
      });
  }, []);

  const handleDelete = async (gameId: string, name: string) => {
    if (!confirm(`Delete ${name}? This will remove all resources.`)) {
      return;
    }

    try {
      const response = await fetch(`/api/games/${gameId}`, {
        method: 'DELETE',
      });

      if (response.ok) {
        setGames(games.filter((g) => g.id !== gameId));
      } else {
        alert('Failed to delete game');
      }
    } catch (error) {
      console.error('Delete error:', error);
      alert('Failed to delete game');
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

      {games.length === 0 ? (
        <div className="flex flex-1 flex-col gap-6 items-center justify-center rounded-lg border border-dashed shadow-sm p-6 bg-muted min-h-64">
          <div className="flex flex-col items-center gap-1 text-center">
            <h3 className="text-2xl font-bold tracking-tight">There are no games</h3>
            <p className="text-sm text-muted-foreground">Start by adding a game.</p>
          </div>
          <Button asChild>
            <Link to="/admin/add-game">Add Game</Link>
          </Button>
        </div>
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
                  <TableRow key={game.id}>
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
