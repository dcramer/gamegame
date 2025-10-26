import { useState } from 'react';
import { useNavigate } from 'react-router';
import { Dices, Puzzle } from 'lucide-react';
import AdminLayout from '../components/AdminLayout';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Spinner } from '../components/ui/spinner';
import { PageHeader } from '../components/PageHeader';
import { Card, CardContent } from '../components/ui/card';
import { EmptyState } from '../components/EmptyState';
import { useFlashNotifications } from '../hooks/useFlashNotifications';
import { type BGGSearchResult, bggSearchResultsListSchema, gameSchema } from '../lib/schemas';
import { apiClient } from '../../load-context';
import { createMeta, createAdminTitle } from '../lib/meta';

export const meta = () => {
  return createMeta({
    title: createAdminTitle('Add Game'),
    description: "Add a new board game to GameGame.",
    noIndex: true,
  });
};

export async function loader({ context }: { context: { api: any } }) {
  const { requireAdmin } = await import('../lib/auth');
  await requireAdmin(context.api);
  return {};
}

export default function AdminAddGame() {
  const navigate = useNavigate();
  const [searchQuery, setSearchQuery] = useState('');
  const [searching, setSearching] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  const [bggResults, setBggResults] = useState<BGGSearchResult[]>([]);
  const [importing, setImporting] = useState(false);
  const { addToast } = useFlashNotifications();

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!searchQuery.trim()) return;

    setSearching(true);
    setHasSearched(true);
    try {
      const response = await apiClient.fetch(`/bgg/search?q=${encodeURIComponent(searchQuery)}`);
      if (response.ok) {
        const data = bggSearchResultsListSchema.parse(await response.json());
        // Deduplicate results by ID to avoid React key warnings
        const uniqueResults = Array.from(
          new Map(data.map(game => [game.id, game])).values()
        );
        setBggResults(uniqueResults);
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
        // Try to extract error message from response
        let errorMessage = 'Failed to import game from BGG. Please try again.';
        try {
          const errorData = await response.json() as { error?: string };
          if (errorData.error) {
            errorMessage = errorData.error;
          }
        } catch {
          // Use default message if can't parse response
        }
        addToast('error', errorMessage);
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
      />

      <div className="space-y-8">
        {/* Search Form */}
        <form onSubmit={handleSearch} className="space-y-4">
          <div className="flex gap-2">
            <Input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search BoardGameGeek..."
              className="flex-1"
              autoFocus
            />
            <Button type="submit" disabled={searching} className="min-w-[100px]">
              {searching ? <Spinner size="sm" /> : 'Search'}
            </Button>
          </div>
          <p className="text-sm text-muted-foreground">
            Search BoardGameGeek to import official game data, box art, and metadata.
          </p>
        </form>

        {/* Results */}
        {bggResults.length > 0 && (
          <Card>
            <CardContent className="p-0">
              <div className="divide-y">
                {bggResults.map((game) => {
                  const imageUrl = game.isImported && game.gameImageUrl
                    ? game.gameImageUrl
                    : game.thumbnailUrl;

                  return (
                    <button
                      key={game.id}
                      className={`flex items-center gap-4 p-4 transition-colors cursor-pointer w-full text-left ${
                        game.isImported
                          ? 'bg-green-50 dark:bg-green-950/30 hover:bg-green-100 dark:hover:bg-green-950/50'
                          : 'hover:bg-muted/50'
                      }`}
                      onClick={() => {
                        if (game.isImported && game.gameId) {
                          navigate(`/admin/games/${game.gameId}`);
                        } else {
                          handleImportFromBGG(game.id);
                        }
                      }}
                      disabled={importing}
                    >
                      {imageUrl ? (
                        <img
                          src={imageUrl}
                          alt={game.name}
                          className="w-16 h-16 object-cover rounded bg-muted"
                          loading="lazy"
                        />
                      ) : (
                        <div className="w-16 h-16 rounded bg-muted flex items-center justify-center">
                          <Dices className="w-8 h-8 text-muted-foreground" />
                        </div>
                      )}

                      <div className="flex-1 min-w-0">
                        <div className="flex items-baseline gap-3">
                          <h4 className="font-medium text-lg truncate">{game.name}</h4>
                          {game.yearPublished && (
                            <span className="text-sm text-muted-foreground shrink-0">
                              ({game.yearPublished})
                            </span>
                          )}
                        </div>
                        <p className="text-sm text-muted-foreground truncate mt-0.5 flex items-center gap-1">
                          {game.type === 'boardgameexpansion' && (
                            <>
                              <Puzzle className="w-3 h-3 inline" />
                              <span>Expansion •</span>
                            </>
                          )}
                          <span>BGG #{game.id}</span>
                        </p>
                      </div>

                      <div className="text-sm shrink-0">
                        {game.isImported ? (
                          <span className="text-green-600 dark:text-green-400 font-medium">View →</span>
                        ) : (
                          <span className="text-primary">Click to import →</span>
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Empty State */}
        {!searching && hasSearched && bggResults.length === 0 && (
          <EmptyState
            title={`No results found for "${searchQuery}"`}
            description="Try a different search term or check the spelling"
          />
        )}
      </div>
    </AdminLayout>
  );
}
