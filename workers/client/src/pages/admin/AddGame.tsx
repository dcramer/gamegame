import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import AdminLayout from '../../components/AdminLayout';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Spinner } from '../../components/ui/spinner';
import Heading from '../../components/Heading';
import { Card, CardContent, CardHeader, CardDescription, CardTitle } from '../../components/ui/card';

interface BGGGame {
  id: string;
  name: string;
  yearPublished: number | null;
  thumbnail: string | null;
  bggUrl: string;
}

export default function AdminAddGame() {
  const navigate = useNavigate();
  const [searchQuery, setSearchQuery] = useState('');
  const [searching, setSearching] = useState(false);
  const [bggResults, setBggResults] = useState<BGGGame[]>([]);
  const [importing, setImporting] = useState(false);

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!searchQuery.trim()) return;

    setSearching(true);
    try {
      const response = await fetch(`/api/bgg/search?q=${encodeURIComponent(searchQuery)}`);
      if (response.ok) {
        const data = await response.json();
        setBggResults(data);
      } else {
        alert('Failed to search BGG');
      }
    } catch (error) {
      console.error('BGG search error:', error);
      alert('Failed to search BGG');
    } finally {
      setSearching(false);
    }
  };

  const handleImportFromBGG = async (bggGameId: string) => {
    setImporting(true);
    try {
      const response = await fetch(`/api/bgg/games/${bggGameId}/import`, {
        method: 'POST',
      });

      if (response.ok) {
        const game = await response.json();
        navigate(`/admin/games/${game.id}`);
      } else {
        alert('Failed to import game from BGG');
      }
    } catch (error) {
      console.error('Import error:', error);
      alert('Failed to import game from BGG');
    } finally {
      setImporting(false);
    }
  };

  return (
    <AdminLayout>
      <div className="mx-auto flex max-w-4xl flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-2">
          <Heading className="text-3xl font-semibold tracking-tight">Add Game</Heading>
          <p className="max-w-xl text-sm text-muted-foreground">
            Search BoardGameGeek to pull in official art and metadata. You can always refine the details or add a title manually if you can’t find it.
          </p>
        </div>
        <Button variant="outline" asChild className="w-full sm:w-auto">
          <Link to="/admin/add-game/manual">Manual entry</Link>
        </Button>
      </div>

      <div className="mx-auto mt-6 max-w-4xl space-y-8">
      <Card>
        <CardHeader className="space-y-2">
          <CardTitle className="text-2xl font-semibold">Find your game</CardTitle>
          <CardDescription className="text-muted-foreground">
            Search BoardGameGeek to import official box art, year, and metadata. You can always tweak details later or switch to manual entry.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSearch} className="space-y-4">
            <div className="flex flex-col gap-3 md:flex-row">
              <Input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search for a game..."
                className="flex-1"
              />
              <Button type="submit" disabled={searching} className="md:w-auto">
                {searching ? <Spinner size="sm" /> : 'Search'}
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              Tip: include the publisher or edition to narrow things down.
            </p>
          </form>
        </CardContent>
      </Card>
      {bggResults.length > 0 ? (
        <div className="space-y-3">
          {bggResults.map((game) => (
            <Card
              key={game.id}
              className="hover:bg-accent/30 transition-colors"
              onClick={() => handleImportFromBGG(game.id)}
            >
              <CardContent className="flex items-center gap-4 p-4">
                {game.thumbnail ? (
                  <div className="relative h-20 w-20 overflow-hidden rounded-md border border-border bg-muted">
                    <img
                      src={game.thumbnail}
                      alt={game.name}
                      className="h-full w-full object-cover"
                      loading="lazy"
                    />
                  </div>
                ) : (
                  <div className="flex h-20 w-20 items-center justify-center rounded-md border border-dashed text-2xl text-muted-foreground">
                    🎲
                  </div>
                )}

                <div className="flex-1 min-w-0">
                  <div className="flex items-baseline justify-between gap-4">
                    <h4 className="text-lg font-semibold truncate">{game.name}</h4>
                    {game.yearPublished && (
                      <span className="text-sm text-muted-foreground">{game.yearPublished}</span>
                    )}
                  </div>
                  <p className="mt-1 text-sm text-muted-foreground truncate">{game.bggUrl}</p>
                </div>

                <Button
                  variant="secondary"
                  size="sm"
                  disabled={importing}
                  onClick={(e) => {
                    e.stopPropagation();
                    handleImportFromBGG(game.id);
                  }}
                >
                  {importing ? <Spinner size="sm" /> : 'Import'}
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        !searching && (
          <Card className="border-dashed">
            <CardContent className="flex flex-col items-center justify-center gap-3 py-14 text-center">
              <div className="rounded-full bg-muted px-4 py-2 text-sm text-muted-foreground">No results yet</div>
              <p className="max-w-sm text-sm text-muted-foreground">
                Try searching for your game above. If you can’t find it, you can add it manually instead.
              </p>
              <p className="text-sm">
                <Link to="/admin/add-game/manual" className="text-primary hover:underline">
                  Prefer to type it in yourself?
                </Link>
              </p>
            </CardContent>
          </Card>
        )
      )}
      </div>
    </AdminLayout>
  );
}
