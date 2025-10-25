import { useState, useCallback } from 'react';
import { useParams, useNavigate, useOutletContext, Link } from 'react-router';
import { Download, RefreshCw, Trash2 } from 'lucide-react';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Card, CardContent } from '../components/ui/card';
import { SaveButton } from '../components/ui/save-button';
import { useFlashNotifications } from '../hooks/useFlashNotifications';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '../components/ui/table';
import {
  gameSchema,
  type Game,
  uploadResponseSchema,
} from '../lib/schemas';
import { z } from 'zod';
import { apiClient } from '../../load-context';

// Schema for image upload response
const imageUploadResponseSchema = z.object({
  url: z.string(),
});

export default function GameDetailsTab() {
  const { gameId } = useParams<{ gameId: string }>();
  const navigate = useNavigate();
  const { game: initialGame, resources: initialResources } = useOutletContext<any>();

  const [game, setGame] = useState<Game>(initialGame);
  const [resources, setResources] = useState<any[]>(initialResources);

  // Game form state
  const [gameName, setGameName] = useState(initialGame.name || '');
  const [gameBggUrl, setGameBggUrl] = useState(initialGame.bggUrl || '');
  const [gameImageUrl, setGameImageUrl] = useState<string | null>(initialGame.imageUrl);
  const [gameImageFile, setGameImageFile] = useState<File | null>(null);
  const [updatingGame, setUpdatingGame] = useState(false);
  const [updateStatus, setUpdateStatus] = useState<'idle' | 'success' | 'error'>('idle');

  // Resource upload state
  const [isDragging, setIsDragging] = useState(false);

  // Flash notifications for feedback
  const { addJobNotification, addToast } = useFlashNotifications();

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

  const handleResourceFiles = async (files: File[]) => {
    if (!gameId) return;

    for (const file of files) {
      try {
        const formData = new FormData();
        formData.append('file', file);
        formData.append('name', file.name);

        const uploadResponse = await apiClient.fetch(`/games/${gameId}/resources`, {
          method: 'POST',
          body: formData,
        });

        if (uploadResponse.ok) {
          const data = uploadResponseSchema.parse(await uploadResponse.json());
          addJobNotification(data.jobId, 'Upload Resource', `Processing ${file.name}`);
        } else {
          addToast('error', `Failed to upload ${file.name}`);
        }
      } catch (error) {
        console.error('Upload error:', error);
        addToast('error', `Failed to upload ${file.name}`);
      }
    }
  };

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);

    const files = Array.from(e.dataTransfer.files).filter((f) => f.type === 'application/pdf');
    if (files.length > 0) {
      handleResourceFiles(files);
    }
  }, [gameId]);

  const triggerFileInput = (e: React.MouseEvent) => {
    e.stopPropagation();
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.pdf';
    input.multiple = true;
    input.onchange = (e) => {
      const files = Array.from((e.target as HTMLInputElement).files || []);
      handleResourceFiles(files);
    };
    input.click();
  };

  const handleReprocess = async (resourceId: string, resourceName: string) => {
    try {
      const response = await apiClient.fetch(`/resources/${resourceId}/reprocess`, {
        method: 'POST',
      });

      if (response.ok) {
        const data = uploadResponseSchema.parse(await response.json());
        addJobNotification(data.jobId, 'Full Reprocess', `Reprocessing ${resourceName}`);
      } else {
        addToast('error', 'Failed to reprocess resource');
      }
    } catch (error) {
      console.error('Reprocess error:', error);
      addToast('error', 'Failed to reprocess resource');
    }
  };

  const handleDelete = async (resourceId: string, resourceName: string) => {
    if (!confirm(`Delete resource "${resourceName}"?`)) return;

    try {
      const response = await apiClient.fetch(`/resources/${resourceId}`, {
        method: 'DELETE',
      });

      if (response.ok) {
        setResources(resources.filter((r) => r.id !== resourceId));
        addToast('success', `Deleted ${resourceName}`);
      } else {
        addToast('error', 'Failed to delete resource');
      }
    } catch (error) {
      console.error('Delete error:', error);
      addToast('error', 'Failed to delete resource');
    }
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
                className="relative max-h-96 max-w-96 cursor-pointer"
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
                <Card>
                  <CardContent className="flex flex-col items-center">
                    {gameImageUrl ? (
                      <div className="w-full aspect-[3/2] overflow-hidden relative">
                        <img
                          src={gameImageUrl}
                          alt="Box Art"
                          className="w-full h-full object-cover object-top"
                        />
                      </div>
                    ) : (
                      <div className="p-6">Drag an image to upload</div>
                    )}
                  </CardContent>
                </Card>
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

