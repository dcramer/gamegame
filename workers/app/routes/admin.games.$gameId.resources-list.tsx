import { useState, useCallback } from 'react';
import { useParams, useNavigate, useOutletContext, Link } from 'react-router';
import { Download, RefreshCw, Trash2 } from 'lucide-react';
import { Button } from '../components/ui/button';
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
  uploadResponseSchema,
} from '../lib/schemas';
import { apiClient } from '../../load-context';

export default function GameResourcesTab() {
  const { gameId } = useParams<{ gameId: string }>();
  const navigate = useNavigate();
  const { resources: initialResources } = useOutletContext<any>();

  const [resources, setResources] = useState<any[]>(initialResources);

  // Resource upload state
  const [isDragging, setIsDragging] = useState(false);

  // Flash notifications for feedback
  const { addJobNotification, addToast } = useFlashNotifications();

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

          // Immediately add the new resource to the list (optimistic update)
          const newResource = {
            id: data.resourceId,
            gameId: gameId,
            name: file.name,
            url: '', // Will be set after processing
            version: 0,
            status: 'processing',
            currentJobId: data.jobId,
            processingStage: 'ingest',
            processedAt: null,
            pageCount: null,
            imageCount: 0,
            wordCount: 0,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          };
          setResources((prev) => [...prev, newResource]);
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

    // Accept all files - validation happens server-side
    const files = Array.from(e.dataTransfer.files);
    if (files.length > 0) {
      handleResourceFiles(files);
    }
  }, [gameId]);

  const triggerFileInput = (e: React.MouseEvent) => {
    e.stopPropagation();
    const input = document.createElement('input');
    input.type = 'file';
    // Accept multiple document and image formats
    input.accept = '.pdf,.txt,.md,.markdown,.docx,.doc,.png,.jpg,.jpeg,.webp,.gif,.bmp,.tiff';
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
        setResources((prev) => prev.filter((r) => r.id !== resourceId));
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
    <div
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {resources.length === 0 ? (
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
              Drag a document, image, or text file here, or click to browse files.
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
                <TableHead className="w-[120px] text-center">Actions</TableHead>
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

                return (
                  <TableRow
                    key={resource.id}
                    className="cursor-pointer hover:bg-muted/50"
                    onClick={() => {
                      navigate(`/admin/games/${gameId}/resources/${resource.id}`);
                    }}
                  >
                    <TableCell>
                      <Link
                        to={`/admin/games/${gameId}/resources/${resource.id}`}
                        className="font-semibold hover:underline"
                        onClick={(e) => e.stopPropagation()}
                      >
                        {resource.name}
                      </Link>
                      {stats && (
                        <div className="text-xs text-muted-foreground mt-1">
                          {stats}
                        </div>
                      )}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground text-center align-middle">
                      {resource.processedAt
                        ? new Date(resource.processedAt).toLocaleString()
                        : '-'}
                    </TableCell>
                    <TableCell className="text-center align-middle">{resource.version}</TableCell>
                    <TableCell className="text-center align-middle">
                      <div className="flex items-center justify-center gap-2">
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-8 w-8 p-0"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleReprocess(resource.id, resource.name);
                          }}
                          title="Reprocess"
                        >
                          <RefreshCw className="h-4 w-4" />
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-8 w-8 p-0"
                          asChild
                          title="Download"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <a href={resource.url} target="_blank" rel="noopener noreferrer">
                            <Download className="h-4 w-4" />
                          </a>
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-8 w-8 p-0"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDelete(resource.id, resource.name);
                          }}
                          title="Delete"
                        >
                          <Trash2 className="h-4 w-4 text-red-500" />
                        </Button>
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
  );
}
