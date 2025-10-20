import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import AdminLayout from '../../components/AdminLayout';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Spinner } from '../../components/ui/spinner';
import Heading from '../../components/Heading';

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
      <div className="flex justify-between items-center mb-6">
        <Heading className="text-3xl">Add Game from BoardGameGeek</Heading>
        <Link to="/admin/add-game/manual">
          <Button variant="outline">Manual Entry</Button>
        </Link>
      </div>

      <div className="max-w-2xl">
        <form onSubmit={handleSearch} className="mb-8">
          <div className="flex gap-2">
            <Input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search for a game..."
              className="flex-1"
            />
            <Button type="submit" disabled={searching}>
              {searching ? <Spinner size="sm" /> : 'Search'}
            </Button>
          </div>
        </form>

        {bggResults.length > 0 && (
          <div className="space-y-3">
            {bggResults.map((game) => (
              <div
                key={game.id}
                className="flex items-center gap-4 p-4 border border-border rounded hover:bg-accent transition-colors"
              >
                {game.thumbnail && (
                  <img
                    src={game.thumbnail}
                    alt={game.name}
                    className="w-20 h-20 object-cover rounded"
                  />
                )}
                <div className="flex-1 min-w-0">
                  <h4 className="font-semibold text-lg">{game.name}</h4>
                  {game.yearPublished && (
                    <p className="text-sm text-muted-foreground">
                      {game.yearPublished}
                    </p>
                  )}
                </div>
                <Button
                  onClick={() => handleImportFromBGG(game.id)}
                  disabled={importing}
                >
                  {importing ? <Spinner size="sm" /> : 'Import'}
                </Button>
              </div>
            ))}
          </div>
        )}
      </div>
    </AdminLayout>
  );
}
