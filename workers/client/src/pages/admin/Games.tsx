import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import AdminLayout from '../../components/AdminLayout';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/card';
import { Button } from '../../components/ui/button';
import { Spinner } from '../../components/ui/spinner';
import Heading from '../../components/Heading';

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

  const handleDelete = async (gameId: string) => {
    if (!confirm('Are you sure you want to delete this game?')) {
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
      <div className="flex justify-between items-center mb-6">
        <Heading className="text-3xl">Games</Heading>
        <Link to="/admin/add-game">
          <Button>Add Game</Button>
        </Link>
      </div>

      {games.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            <p className="mb-4">No games yet.</p>
            <Link to="/admin/add-game">
              <Button>Add your first game</Button>
            </Link>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {games.map((game) => (
            <Card key={game.id}>
              <CardContent className="p-6">
                <div className="flex items-center gap-6">
                  {game.imageUrl && (
                    <img
                      src={game.imageUrl}
                      alt={game.name}
                      className="w-24 h-24 object-cover rounded"
                    />
                  )}
                  <div className="flex-1 min-w-0">
                    <h3 className="text-xl font-semibold mb-1">
                      {game.name}
                      {game.year && (
                        <span className="text-muted-foreground font-normal ml-2">
                          ({game.year})
                        </span>
                      )}
                    </h3>
                    <p className="text-sm text-muted-foreground mb-1">
                      {game.resourceCount || 0} resource(s)
                    </p>
                    <p className="text-xs text-muted-foreground font-mono">
                      /games/{game.slug}
                    </p>
                    {game.bggUrl && (
                      <a
                        href={game.bggUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-sm text-blue-600 hover:underline"
                      >
                        View on BGG
                      </a>
                    )}
                  </div>
                  <div className="flex gap-2">
                    <Link to={`/admin/games/${game.id}/edit`}>
                      <Button variant="outline">Edit</Button>
                    </Link>
                    <Link to={`/admin/games/${game.id}`}>
                      <Button variant="outline">Manage Resources</Button>
                    </Link>
                    <Button
                      variant="outline"
                      onClick={() => handleDelete(game.id)}
                    >
                      Delete
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </AdminLayout>
  );
}
