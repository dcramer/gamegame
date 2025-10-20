import { useState, useEffect } from 'react';
import { useNavigate, useParams, Link } from 'react-router-dom';
import AdminLayout from '../../components/AdminLayout';
import { Card, CardContent } from '../../components/ui/card';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Label } from '../../components/ui/label';
import { Spinner } from '../../components/ui/spinner';
import Heading from '../../components/Heading';

interface Game {
  id: string;
  name: string;
  year?: number | null;
  slug: string;
  imageUrl: string | null;
  bggUrl: string | null;
}

export default function EditGame() {
  const navigate = useNavigate();
  const { gameId } = useParams<{ gameId: string }>();
  const [game, setGame] = useState<Game | null>(null);
  const [name, setName] = useState('');
  const [year, setYear] = useState('');
  const [slug, setSlug] = useState('');
  const [imageUrl, setImageUrl] = useState('');
  const [bggUrl, setBggUrl] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!gameId) return;

    fetch(`/api/games/${gameId}`)
      .then((res) => res.json())
      .then((data) => {
        setGame(data);
        setName(data.name);
        setYear(data.year ? data.year.toString() : '');
        setSlug(data.slug || '');
        setImageUrl(data.imageUrl || '');
        setBggUrl(data.bggUrl || '');
        setLoading(false);
      })
      .catch((err) => {
        console.error('Failed to load game:', err);
        setLoading(false);
        alert('Failed to load game');
      });
  }, [gameId]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !gameId) return;

    setSaving(true);
    try {
      const response = await fetch(`/api/games/${gameId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          year: year ? parseInt(year, 10) : null,
          slug: slug || undefined,
          imageUrl: imageUrl || undefined,
          bggUrl: bggUrl || undefined,
        }),
      });

      if (response.ok) {
        navigate('/admin/games');
      } else {
        alert('Failed to update game');
      }
    } catch (error) {
      console.error('Update error:', error);
      alert('Failed to update game');
    } finally {
      setSaving(false);
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

  if (!game) {
    return (
      <AdminLayout>
        <div className="text-center py-12">
          <p className="text-xl mb-4">Game not found</p>
          <Link to="/admin/games">
            <Button>Back to Games</Button>
          </Link>
        </div>
      </AdminLayout>
    );
  }

  return (
    <AdminLayout>
      <div className="mb-6">
        <Link to="/admin/games" className="text-sm text-muted-foreground hover:underline mb-2 inline-block">
          ← Back to Games
        </Link>
        <Heading className="text-3xl">Edit Game</Heading>
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
                <Label htmlFor="slug">Slug</Label>
                <Input
                  id="slug"
                  type="text"
                  value={slug}
                  onChange={(e) => setSlug(e.target.value)}
                  placeholder="arcs-2024"
                />
                <p className="text-xs text-muted-foreground">
                  URL-friendly identifier (auto-generated from name and year if left blank)
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

              <div className="flex gap-2">
                <Button type="submit" disabled={saving} className="flex-1">
                  {saving ? <Spinner size="sm" /> : 'Save Changes'}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => navigate('/admin/games')}
                  disabled={saving}
                >
                  Cancel
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      </div>
    </AdminLayout>
  );
}
