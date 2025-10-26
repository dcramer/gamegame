import { useState } from 'react';
import { useParams, useOutletContext } from 'react-router';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Card, CardContent } from '../components/ui/card';
import { SaveButton } from '../components/ui/save-button';
import { useFlashNotifications } from '../hooks/useFlashNotifications';
import {
  gameSchema,
  type Game,
} from '../lib/schemas';
import { z } from 'zod';
import { apiClient } from '../../load-context';

// Schema for image upload response
const imageUploadResponseSchema = z.object({
  url: z.string(),
});

export async function loader({ context }: { context: { api: any } }) {
  const { requireAdmin } = await import('../lib/auth');
  await requireAdmin(context.api);
  return {};
}

export default function GameDetailsTab() {
  const { gameId } = useParams<{ gameId: string }>();
  const { game: initialGame } = useOutletContext<any>();

  const [game, setGame] = useState<Game>(initialGame);

  // Game form state
  const [gameName, setGameName] = useState(initialGame.name || '');
  const [gameBggUrl, setGameBggUrl] = useState(initialGame.bggUrl || '');
  const [gameImageUrl, setGameImageUrl] = useState<string | null>(initialGame.imageUrl);
  const [gameImageFile, setGameImageFile] = useState<File | null>(null);
  const [updatingGame, setUpdatingGame] = useState(false);
  const [updateStatus, setUpdateStatus] = useState<'idle' | 'success' | 'error'>('idle');

  // Flash notifications for feedback
  const { addToast } = useFlashNotifications();

  const handleUpdateGame = async (e: React.FormEvent) => {
    e.preventDefault();
    setUpdatingGame(true);
    setUpdateStatus('idle');

    try {
      // Build update payload - only send fields that have changed
      const payload: any = {};

      // Check each field against original game data
      if (gameName !== game?.name) {
        payload.name = gameName;
      }

      // Only send bggUrl if it's non-empty and changed
      if (gameBggUrl.trim() && gameBggUrl !== (game?.bggUrl || '')) {
        payload.bggUrl = gameBggUrl.trim();
      } else if (!gameBggUrl.trim() && game?.bggUrl) {
        payload.bggUrl = null;
      }

      // Upload image if changed
      if (gameImageFile) {
        const formData = new FormData();
        formData.append('file', gameImageFile);

        const uploadResponse = await apiClient.fetch('/images/upload', {
          method: 'POST',
          body: formData,
        });

        if (uploadResponse.ok) {
          const uploadData = imageUploadResponseSchema.parse(await uploadResponse.json());
          payload.imageUrl = uploadData.url;
        }
      }

      // Update game
      const response = await apiClient.fetch(`/games/${gameId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (response.ok) {
        const updatedGame = gameSchema.parse(await response.json());
        setGame(updatedGame);
        setGameName(updatedGame.name || '');
        setGameBggUrl(updatedGame.bggUrl || '');
        setGameImageUrl(updatedGame.imageUrl);
        setGameImageFile(null);
        setUpdateStatus('success');
        addToast('success', 'Game details saved successfully!');
      } else {
        setUpdateStatus('error');
        addToast('error', 'Failed to save game details. Please try again.');
      }
    } catch (error) {
      console.error('Update error:', error);
      setUpdateStatus('error');
      addToast('error', 'Failed to save game details. Please try again.');
    } finally {
      setUpdatingGame(false);
    }
  };

  const handleImageChange = (file: File) => {
    const url = URL.createObjectURL(file);
    setGameImageUrl(url);
    setGameImageFile(file);
  };

  return (
    <div>
      {/* Game Edit Form */}
      <Card className="max-w-2xl">
        <CardContent className="pt-6">
          <form onSubmit={handleUpdateGame} className="space-y-6">
            <div className="space-y-2">
              <Label htmlFor="name">Name</Label>
              <Input
                id="name"
                type="text"
                value={gameName}
                onChange={(e) => setGameName(e.target.value)}
                placeholder="Settlers of Catan"
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="bggUrl">BGG URL</Label>
              <Input
                id="bggUrl"
                type="text"
                value={gameBggUrl}
                onChange={(e) => setGameBggUrl(e.target.value)}
                placeholder="e.g. https://boardgamegeek.com/boardgame/13/catan"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="bggId">BGG ID</Label>
                <Input
                  id="bggId"
                  type="text"
                  value={game.bggId || 'N/A'}
                  readOnly
                  className="bg-muted cursor-not-allowed"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="year">Year</Label>
                <Input
                  id="year"
                  type="text"
                  value={game.year || 'N/A'}
                  readOnly
                  className="bg-muted cursor-not-allowed"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="createdAt">Created</Label>
                <Input
                  id="createdAt"
                  type="text"
                  value={game.createdAt ? new Date(game.createdAt).toLocaleString() : 'N/A'}
                  readOnly
                  className="bg-muted cursor-not-allowed"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="updatedAt">Last Updated</Label>
                <Input
                  id="updatedAt"
                  type="text"
                  value={game.updatedAt ? new Date(game.updatedAt).toLocaleString() : 'N/A'}
                  readOnly
                  className="bg-muted cursor-not-allowed"
                />
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>Box Art</Label>
                {gameImageUrl && (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      const input = document.createElement('input');
                      input.type = 'file';
                      input.accept = 'image/*';
                      input.onchange = (e) => {
                        const file = (e.target as HTMLInputElement).files?.[0];
                        if (file) handleImageChange(file);
                      };
                      input.click();
                    }}
                  >
                    Upload Image
                  </Button>
                )}
              </div>

              <div
                className="relative max-h-96 max-w-96 cursor-pointer border rounded-lg overflow-hidden hover:border-primary/50 transition-colors"
                onClick={() => {
                  if (!gameImageUrl) {
                    const input = document.createElement('input');
                    input.type = 'file';
                    input.accept = 'image/*';
                    input.onchange = (e) => {
                      const file = (e.target as HTMLInputElement).files?.[0];
                      if (file) handleImageChange(file);
                    };
                    input.click();
                  }
                }}
                onDragOver={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                }}
                onDrop={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  const file = e.dataTransfer.files[0];
                  if (file && file.type.startsWith('image/')) {
                    handleImageChange(file);
                  }
                }}
              >
                {gameImageUrl ? (
                  <div className="w-full aspect-[3/2] overflow-hidden relative">
                    <img
                      src={gameImageUrl}
                      alt="Box Art"
                      className="w-full h-full object-cover object-top"
                    />
                  </div>
                ) : (
                  <div className="flex items-center justify-center p-12 bg-muted text-muted-foreground">
                    Drag an image to upload
                  </div>
                )}
              </div>
            </div>

            <SaveButton
              type="submit"
              status={updateStatus}
              isLoading={updatingGame}
              onStatusTimeout={() => setUpdateStatus('idle')}
            >
              Update Game
            </SaveButton>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}

