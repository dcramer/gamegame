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
  const [bggUnavailable, setBggUnavailable] = useState(false);
  const [showManualForm, setShowManualForm] = useState(false);
  const { addToast } = useFlashNotifications();

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!searchQuery.trim()) return;

    setSearching(true);
    setHasSearched(true);
    setBggUnavailable(false);
    try {
      const response = await apiClient.fetch(`/bgg/search?q=${encodeURIComponent(searchQuery)}`);
      if (response.ok) {
        const data = bggSearchResultsListSchema.parse(await response.json());
        // Deduplicate results by ID to avoid React key warnings
        const uniqueResults = Array.from(
          new Map(data.map(game => [game.id, game])).values()
        );
        setBggResults(uniqueResults);
      } else if (response.status === 503) {
        // BGG API key not configured
        const errorData = await response.json() as { error?: string };
        if (errorData.error === 'BGG_API_KEY_MISSING') {
          setBggUnavailable(true);
          setBggResults([]);
        } else {
          addToast('error', 'Failed to search BGG. Please try again.');
        }
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
        {/* Manual Form */}
        {showManualForm && <ManualGameForm onCancel={() => setShowManualForm(false)} />}

        {/* Search Form */}
        {!showManualForm && (
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
        )}

        {/* Results */}
        {(bggResults.length > 0 || (hasSearched && !searching)) && !showManualForm && (
          <Card>
            <CardContent className="p-0">
              <div className="divide-y">
                {/* Manual Creation Row - Always shown at top */}
                <button
                  className="flex items-center gap-4 p-4 transition-colors cursor-pointer w-full text-left hover:bg-muted/50 border-b-2 border-primary/20"
                  onClick={() => setShowManualForm(true)}
                >
                  <div className="w-16 h-16 rounded bg-primary/10 flex items-center justify-center">
                    <Dices className="w-8 h-8 text-primary" />
                  </div>

                  <div className="flex-1 min-w-0">
                    <h4 className="font-medium text-lg">Add Game Manually</h4>
                    <p className="text-sm text-muted-foreground mt-0.5">
                      Can't find your game? Create it manually with basic information
                    </p>
                  </div>

                  <div className="text-sm shrink-0">
                    <span className="text-primary">Click to create →</span>
                  </div>
                </button>

                {/* BGG Search Results */}
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

        {/* BGG Unavailable Warning (shown above results) */}
        {bggUnavailable && hasSearched && !showManualForm && (
          <Card className="border-yellow-200 dark:border-yellow-800 bg-yellow-50 dark:bg-yellow-950/30">
            <CardContent className="p-4">
              <p className="text-sm text-yellow-800 dark:text-yellow-200">
                <strong>BoardGameGeek search unavailable:</strong> API key not configured. You can still add games manually using the row above.
              </p>
            </CardContent>
          </Card>
        )}
      </div>
    </AdminLayout>
  );
}

// Manual game creation form component
function ManualGameForm({ onCancel }: { onCancel: () => void }) {
  const navigate = useNavigate();
  const [name, setName] = useState('');
  const [year, setYear] = useState('');
  const [bggUrl, setBggUrl] = useState('');
  const [creating, setCreating] = useState(false);
  const { addToast } = useFlashNotifications();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      addToast('error', 'Game name is required');
      return;
    }

    setCreating(true);
    try {
      const body: { name: string; year?: number; bggUrl?: string } = {
        name: name.trim(),
      };
      if (year) {
        body.year = parseInt(year, 10);
      }
      if (bggUrl.trim()) {
        body.bggUrl = bggUrl.trim();
      }

      const response = await apiClient.fetch('/games', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      if (response.ok) {
        const game = gameSchema.parse(await response.json());
        addToast('success', `Successfully created ${game.name}!`);
        navigate(`/admin/games/${game.id}`);
      } else {
        let errorMessage = 'Failed to create game. Please try again.';
        try {
          const errorData = await response.json() as { error?: string };
          if (errorData.error) {
            errorMessage = errorData.error;
          }
        } catch {
          // Use default message
        }
        addToast('error', errorMessage);
      }
    } catch (error) {
      console.error('Create error:', error);
      addToast('error', 'Failed to create game. Please try again.');
    } finally {
      setCreating(false);
    }
  };

  return (
    <Card>
      <CardContent className="p-6">
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="name" className="block text-sm font-medium mb-2">
              Game Name <span className="text-destructive">*</span>
            </label>
            <Input
              id="name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Enter game name"
              required
              autoFocus
            />
          </div>

          <div>
            <label htmlFor="year" className="block text-sm font-medium mb-2">
              Year Published (optional)
            </label>
            <Input
              id="year"
              type="number"
              value={year}
              onChange={(e) => setYear(e.target.value)}
              placeholder="2024"
              min="1900"
              max="2100"
            />
          </div>

          <div>
            <label htmlFor="bggUrl" className="block text-sm font-medium mb-2">
              BoardGameGeek URL (optional)
            </label>
            <Input
              id="bggUrl"
              type="url"
              value={bggUrl}
              onChange={(e) => setBggUrl(e.target.value)}
              placeholder="https://boardgamegeek.com/boardgame/..."
            />
          </div>

          <div className="flex gap-2 pt-2">
            <Button type="submit" disabled={creating}>
              {creating ? <Spinner size="sm" /> : 'Create Game'}
            </Button>
            <Button type="button" variant="outline" onClick={onCancel}>
              Cancel
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
