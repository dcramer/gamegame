import { useState } from 'react';
import { useNavigate } from 'react-router';
import AdminLayout from '../components/AdminLayout';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Spinner } from '../components/ui/spinner';
import { PageHeader } from '../components/PageHeader';
import { Card, CardContent, CardHeader, CardDescription, CardTitle } from '../components/ui/card';
import { useFlashNotifications } from '../hooks/useFlashNotifications';
import { type BGGGame, bggGamesListSchema, gameSchema } from '../lib/schemas';
import { apiClient } from '../../load-context';
import { createMeta, createAdminTitle } from '../lib/meta';

export const meta = () => {
  return createMeta({
    title: createAdminTitle('Add Game'),
    description: "Add a new board game to GameGame.",
    noIndex: true,
  });
};

export default function AdminAddGame() {
  const navigate = useNavigate();
  const [searchQuery, setSearchQuery] = useState('');
  const [searching, setSearching] = useState(false);
  const [bggResults, setBggResults] = useState<BGGGame[]>([]);
  const [importing, setImporting] = useState(false);
  const { addToast } = useFlashNotifications();

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!searchQuery.trim()) return;

    setSearching(true);
    try {
      const response = await apiClient.fetch(`/bgg/search?q=${encodeURIComponent(searchQuery)}`);
      if (response.ok) {
        const data = bggGamesListSchema.parse(await response.json());
        setBggResults(data);
      } else {
        addToast('error', 'Failed to search BGG. Please try again.');
      }
    } catch (error) {
      console.error('BGG search error:', error);
      addToast('error', 'Failed to search BGG. Please try again.');
    } finally {
      setSearching(false);
    }
  };

  const handleImportFromBGG = async (bggGameId: string) => {
    setImporting(true);
    try {
      const response = await apiClient.fetch(`/bgg/games/${bggGameId}/import`, {
        method: 'POST',
      });

      if (response.ok) {
        const game = gameSchema.parse(await response.json());
        addToast('success', `Successfully imported ${game.name}!`);
        navigate(`/admin/games/${game.id}`);
      } else {
        addToast('error', 'Failed to import game from BGG. Please try again.');
      }
    } catch (error) {
      console.error('Import error:', error);
      addToast('error', 'Failed to import game from BGG. Please try again.');
    } finally {
      setImporting(false);
    }
  };

  return (
    <AdminLayout>
      <PageHeader
        breadcrumbs={[
          { label: 'Admin', href: '/admin' },
          { label: 'Games', href: '/admin' },
          { label: 'Add Game' },
        ]}
        title="Add Game"
        description="Search BoardGameGeek to pull in official art and metadata. You can always refine the details after importing."
      />

      <div className="mx-auto max-w-4xl space-y-8">
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
                Try searching for your game above using the BoardGameGeek search.
              </p>
            </CardContent>
          </Card>
        )
      )}
      </div>
    </AdminLayout>
  );
}
