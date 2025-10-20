import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import AdminLayout from '../../components/AdminLayout';
import { Card, CardContent } from '../../components/ui/card';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Label } from '../../components/ui/label';
import { Spinner } from '../../components/ui/spinner';
import Heading from '../../components/Heading';

export default function ManualAddGame() {
  const navigate = useNavigate();
  const [name, setName] = useState('');
  const [year, setYear] = useState('');
  const [imageUrl, setImageUrl] = useState('');
  const [bggUrl, setBggUrl] = useState('');
  const [creating, setCreating] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;

    setCreating(true);
    try {
      const response = await fetch('/api/games', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          year: year ? parseInt(year, 10) : null,
          imageUrl: imageUrl || null,
          bggUrl: bggUrl || null,
        }),
      });

      if (response.ok) {
        const game = await response.json();
        navigate(`/admin/games/${game.id}`);
      } else {
        alert('Failed to create game');
      }
    } catch (error) {
      console.error('Create error:', error);
      alert('Failed to create game');
    } finally {
      setCreating(false);
    }
  };

  return (
    <AdminLayout>
      <div className="mb-6">
        <Link to="/admin/add-game" className="text-sm text-muted-foreground hover:underline mb-2 inline-block">
          ← Back to BGG Search
        </Link>
        <Heading className="text-3xl">Manual Entry</Heading>
      </div>

      <div className="max-w-xl">
        <Card>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="name">Game Name *</Label>
                <Input
                  id="name"
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Arcs"
                  required
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="year">Year Published</Label>
                <Input
                  id="year"
                  type="number"
                  value={year}
                  onChange={(e) => setYear(e.target.value)}
                  placeholder="2024"
                  min="1900"
                  max="2100"
                />
                <p className="text-xs text-muted-foreground">
                  Optional: Year the game was published
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="imageUrl">Image URL</Label>
                <Input
                  id="imageUrl"
                  type="text"
                  value={imageUrl}
                  onChange={(e) => setImageUrl(e.target.value)}
                  placeholder="https://example.com/image.webp or /images/game.webp"
                />
                <p className="text-xs text-muted-foreground">
                  Optional: Direct link or relative path to game cover image
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="bggUrl">BoardGameGeek URL</Label>
                <Input
                  id="bggUrl"
                  type="url"
                  value={bggUrl}
                  onChange={(e) => setBggUrl(e.target.value)}
                  placeholder="https://boardgamegeek.com/boardgame/..."
                />
                <p className="text-xs text-muted-foreground">
                  Optional: Link to BoardGameGeek page
                </p>
              </div>

              <Button type="submit" disabled={creating} className="w-full">
                {creating ? <Spinner size="sm" /> : 'Create Game'}
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </AdminLayout>
  );
}
