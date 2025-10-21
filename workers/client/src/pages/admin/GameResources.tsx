import { useState, useEffect, useCallback } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import AdminLayout from '../../components/AdminLayout';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Label } from '../../components/ui/label';
import { Spinner } from '../../components/ui/spinner';
import Heading from '../../components/Heading';
import { Card, CardContent } from '../../components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '../../components/ui/table';

interface Game {
  id: string;
  name: string;
  year: number | null;
  slug: string;
  imageUrl: string | null;
  bggUrl: string | null;
}

interface Resource {
  id: string;
  name: string;
  url: string;
  version: number;
  pdfExtractor: string | null;
  processedAt: string | null;
  pageCount: number | null;
  imageCount: number;
  wordCount: number;
}

interface JobStatus {
  id: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  progress?: number;
  error?: string;
  resourceId?: string;
  currentStep?: string;
}

export default function AdminGameResources() {
  const { gameId } = useParams<{ gameId: string }>();
  const navigate = useNavigate();
  const [game, setGame] = useState<Game | null>(null);
  const [resources, setResources] = useState<Resource[]>([]);
  const [loading, setLoading] = useState(true);

  // Game form state
  const [gameName, setGameName] = useState('');
  const [gameBggUrl, setGameBggUrl] = useState('');
  const [gameImageUrl, setGameImageUrl] = useState<string | null>(null);
  const [gameImageFile, setGameImageFile] = useState<File | null>(null);
  const [updatingGame, setUpdatingGame] = useState(false);

  // Resource upload state
  const [uploadingResources, setUploadingResources] = useState<Map<string, JobStatus>>(new Map());
  const [isDragging, setIsDragging] = useState(false);

  const clearJob = useCallback((resourceKey: string) => {
    setUploadingResources((prev) => {
      const next = new Map(prev);
      next.delete(resourceKey);
      return next;
    });
  }, []);

  useEffect(() => {
    if (!gameId) return;

    Promise.all([
      fetch(`/api/games/${gameId}`).then((res) => {
        if (!res.ok) throw new Error('Game not found');
        return res.json();
      }),
      fetch(`/api/resources/games/${gameId}`).then((res) => {
        if (!res.ok) throw new Error('Failed to load resources');
        return res.json();
      }),
    ])
      .then(([gameData, resourcesData]) => {
        setGame(gameData);
        setGameName(gameData.name || '');
        setGameBggUrl(gameData.bggUrl || '');
        setGameImageUrl(gameData.imageUrl);
        setResources(resourcesData);
        setLoading(false);
      })
      .catch((err) => {
        console.error('Failed to load game:', err);
        setGame(null);
        setLoading(false);
      });
  }, [gameId]);

  // Poll job status for uploading resources
  useEffect(() => {
    const activeJobs = Array.from(uploadingResources.entries()).filter(
      ([_, job]) => job.status !== 'completed' && job.status !== 'failed'
    );

    if (activeJobs.length === 0) return;

    const interval = setInterval(async () => {
      for (const [resourceKey, job] of activeJobs) {
        try {
          const response = await fetch(`/api/resources/jobs/${job.id}`);

          if (!response.ok) {
            console.warn(`Job status request failed for ${job.id} (${response.status})`);
            setUploadingResources((prev) => {
              const previous = prev.get(resourceKey);
              const next = new Map(prev);
              next.set(resourceKey, {
                id: job.id,
                status: previous?.status ?? 'failed',
                progress: previous?.progress,
                error: `Unable to load job status (${response.status})`,
                currentStep: previous?.currentStep,
                resourceId: resourceKey,
              });
              return next;
            });
            continue;
          }

          const data = await response.json();

          if (data.status === 'completed') {
            clearJob(resourceKey);

            // Refresh resources list
            const resourcesResponse = await fetch(`/api/resources/games/${gameId}`);
            if (resourcesResponse.ok) {
              const resourcesData = await resourcesResponse.json();
              setResources(resourcesData);
            }
          } else {
            setUploadingResources((prev) => {
              const previous = prev.get(resourceKey);
              const next = new Map(prev);
              next.set(resourceKey, {
                id: job.id,
                status: data.status,
                progress: (data.progress ?? previous?.progress) ?? 0,
                error: data.error ?? previous?.error,
                currentStep: data.currentStep ?? previous?.currentStep,
                resourceId: resourceKey,
              });
              return next;
            });
          }
        } catch (error) {
          console.error('Failed to check job status:', error);
          setUploadingResources((prev) => {
            const previous = prev.get(resourceKey);
            const next = new Map(prev);
            next.set(resourceKey, {
              id: job.id,
              status: previous?.status ?? 'failed',
              progress: previous?.progress,
              error: 'Unable to reach job status endpoint',
              currentStep: previous?.currentStep,
              resourceId: resourceKey,
            });
            return next;
          });
        }
      }
    }, 2000);

    return () => clearInterval(interval);
  }, [uploadingResources, gameId, clearJob]);

  const handleUpdateGame = async (e: React.FormEvent) => {
    e.preventDefault();
    setUpdatingGame(true);

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

        const uploadResponse = await fetch('/api/images/upload', {
          method: 'POST',
          body: formData,
        });

        if (uploadResponse.ok) {
          const uploadData = await uploadResponse.json();
          payload.imageUrl = uploadData.url;
        }
      }

      // Update game
      const response = await fetch(`/api/games/${gameId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (response.ok) {
        const updatedGame = await response.json();
        setGame(updatedGame);
        setGameName(updatedGame.name || '');
        setGameBggUrl(updatedGame.bggUrl || '');
        setGameImageUrl(updatedGame.imageUrl);
        setGameImageFile(null);
        alert('Game updated successfully');
      } else {
        const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
        console.error('Failed to update game:', response.status, errorData);
        alert(`Failed to update game: ${errorData.error || response.statusText}`);
      }
    } catch (error) {
      console.error('Update error:', error);
      alert('Failed to update game');
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

        const uploadResponse = await fetch(`/api/games/${gameId}/resources`, {
          method: 'POST',
          body: formData,
        });

        if (uploadResponse.ok) {
          const data = await uploadResponse.json();
          setUploadingResources((prev) => {
            const next = new Map(prev);
            next.set(data.resourceId, {
              id: data.jobId,
              status: 'pending',
              resourceId: data.resourceId,
              currentStep: 'Queued for processing',
            });
            return next;
          });
        } else {
          alert(`Failed to upload ${file.name}`);
        }
      } catch (error) {
        console.error('Upload error:', error);
        alert(`Failed to upload ${file.name}`);
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
      const response = await fetch(`/api/resources/${resourceId}/reprocess`, {
        method: 'POST',
      });

      if (response.ok) {
        const data = await response.json();
        setUploadingResources((prev) => {
          const next = new Map(prev);
          next.set(resourceId, {
            id: data.jobId,
            status: 'pending',
            resourceId,
            currentStep: 'Queued for reprocessing',
          });
          return next;
        });
      } else {
        alert('Failed to reprocess resource');
      }
    } catch (error) {
      console.error('Reprocess error:', error);
      alert('Failed to reprocess resource');
    }
  };

  const handleDelete = async (resourceId: string, resourceName: string) => {
    if (!confirm(`Delete resource "${resourceName}"?`)) return;

    try {
      const response = await fetch(`/api/resources/${resourceId}`, {
        method: 'DELETE',
      });

      if (response.ok) {
        setResources(resources.filter((r) => r.id !== resourceId));
      } else {
        alert('Failed to delete resource');
      }
    } catch (error) {
      console.error('Delete error:', error);
      alert('Failed to delete resource');
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
          <Link to="/admin">
            <Button>Back to Games</Button>
          </Link>
        </div>
      </AdminLayout>
    );
  }

  return (
    <AdminLayout>
      <div className="flex flex-col gap-12">
        <Heading className="text-3xl">{game.name}</Heading>
        {/* Game Edit Form */}
        <form onSubmit={handleUpdateGame} className="grid gap-4">
          <div className="grid gap-2">
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

          <div className="grid gap-2">
            <Label htmlFor="bggUrl">BGG URL</Label>
            <Input
              id="bggUrl"
              type="text"
              value={gameBggUrl}
              onChange={(e) => setGameBggUrl(e.target.value)}
              placeholder="e.g. https://boardgamegeek.com/boardgame/13/catan"
            />
          </div>

          <div className="grid gap-2">
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
              onClick={(e) => {
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

          <Button type="submit" className="mr-auto" disabled={updatingGame}>
            Update Game
            {updatingGame && <Loader2 className="ml-2 h-4 w-4 animate-spin" />}
          </Button>
        </form>

        {/* Resource List */}
        <div
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
        >
          {resources.length === 0 && uploadingResources.size === 0 ? (
            <div
              className={`flex flex-1 flex-col gap-6 items-center justify-center rounded-lg border ${
                isDragging ? 'border-primary bg-primary/10' : 'border-dashed'
              } shadow-sm p-6 bg-muted min-h-64 cursor-pointer hover:bg-muted/80 transition-colors`}
              onClick={triggerFileInput}
            >
              <div className="flex flex-col items-center gap-1 text-center">
                <h3 className="text-2xl font-bold tracking-tight">
                  There are no resources
                </h3>
                <p className="text-sm text-muted-foreground">
                  Drag a PDF file of a rulebook here, or click to browse files.
                </p>
              </div>
            </div>
          ) : (
            <div className="flex flex-col gap-4">
              <div className="flex justify-end">
                <Button onClick={triggerFileInput}>Add Resource</Button>
              </div>

              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Resource</TableHead>
                    <TableHead className="w-[180px] text-center">Last Processed</TableHead>
                    <TableHead className="w-[60px] text-center">Version</TableHead>
                    <TableHead className="w-[200px] text-center">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {resources.map((resource) => {
                    const stats = [
                      resource.pageCount && `${resource.pageCount} pages`,
                      resource.imageCount > 0 && `${resource.imageCount} images`,
                      resource.wordCount > 0 &&
                        `${(resource.wordCount / 1000).toFixed(1)}k words`,
                    ]
                      .filter(Boolean)
                      .join(', ');

                    const job = uploadingResources.get(resource.id);

                    const messageText = job?.error || job?.currentStep;
                    const showFailure = job ? job.status === 'failed' || !!job.error : false;

                    return (
                      <TableRow
                        key={resource.id}
                        className="cursor-pointer hover:bg-muted/50"
                        onClick={() => {
                          navigate(`/admin/games/${gameId}/resources/${resource.id}`);
                        }}
                      >
                        <TableCell>
                          <div>
                            <strong>{resource.name}</strong>
                          </div>
                          {resource.pdfExtractor && (
                            <div className="text-xs text-muted-foreground mt-1">
                              Processed with {resource.pdfExtractor}
                              {stats && ` - ${stats}`}
                            </div>
                          )}
                          {job && (
                            <div className="text-xs mt-1 flex items-center gap-2 flex-wrap">
                              {(job.status === 'pending' || job.status === 'processing') && !showFailure && (
                                <Spinner size="sm" />
                              )}
                              <span
                                className={`capitalize ${showFailure ? 'text-red-500 font-semibold' : 'text-muted-foreground'}`}
                              >
                                {job.status}
                              </span>
                              {messageText && (
                                <span className={`text-xs ${showFailure ? 'text-red-500' : 'text-muted-foreground'}`}>
                                  {messageText}
                                </span>
                              )}
                              {typeof job.progress === 'number' && !showFailure && job.progress > 0 && (
                                <span className="text-xs text-muted-foreground">{job.progress}%</span>
                              )}
                              {showFailure && (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    clearJob(resource.id);
                                  }}
                                >
                                  Dismiss
                                </Button>
                              )}
                            </div>
                          )}
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground text-center">
                          {resource.processedAt
                            ? new Date(resource.processedAt).toLocaleString()
                            : '-'}
                        </TableCell>
                        <TableCell className="text-center">{resource.version}</TableCell>
                        <TableCell className="text-center gap-2 flex">
                          <Button
                            size="sm"
                            variant="secondary"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleReprocess(resource.id, resource.name);
                            }}
                          >
                            Reprocess
                          </Button>
                          <Button
                            size="sm"
                            variant="destructive"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDelete(resource.id, resource.name);
                            }}
                          >
                            Delete
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })}

                  {/* Uploads for new resources not yet processed */}
                  {Array.from(uploadingResources.entries())
                    .filter(([resourceId]) => !resources.some((r) => r.id === resourceId))
                    .map(([resourceId, job]) => {
                      const showFailure = job.status === 'failed' || !!job.error;
                      const messageText = job.error || job.currentStep;

                      return (
                        <TableRow key={`pending-${resourceId}`} className="bg-muted/50">
                          <TableCell colSpan={4}>
                            <div className="flex items-center gap-2 text-sm flex-wrap">
                              {(job.status === 'pending' || job.status === 'processing') && !showFailure && (
                                <Spinner size="sm" />
                              )}
                              <span
                                className={`capitalize ${showFailure ? 'text-red-500 font-semibold' : 'text-muted-foreground'}`}
                              >
                                {job.status}
                              </span>
                              {messageText && (
                                <span className={`text-xs ${showFailure ? 'text-red-500' : 'text-muted-foreground'}`}>
                                  {messageText}
                                </span>
                              )}
                              {typeof job.progress === 'number' && !showFailure && job.progress > 0 && (
                                <span className="text-xs text-muted-foreground">{job.progress}%</span>
                              )}
                              {showFailure && (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => clearJob(resourceId)}
                                >
                                  Dismiss
                                </Button>
                              )}
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                </TableBody>
              </Table>
            </div>
          )}
        </div>
      </div>
    </AdminLayout>
  );
}
