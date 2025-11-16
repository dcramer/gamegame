"use client";

import { FileUpload } from "@/components/file-upload";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ClickableTableRow } from "@/components/ui/clickable-table-row";
import { Spinner } from "@/components/ui/spinner";
import { orpc } from "@/lib/procedures/client";
import { nanoid } from "@/lib/utils";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, useCallback } from "react";
import { upload } from "@/lib/uploads/client";
import { useFlashMessages } from "@/components/flashMessages";
import { useWorkflowFlash } from "@/components/workflowFlashMessage";
import { useProcessing } from "@/components/processing-provider";
import {
  getStageDisplayName,
  getStageMessages,
} from "@/lib/reprocess/stages";

type PendingResource = {
  id: string;
  name: string;
  file: File;
  pending: true;
  error?: string | null;
  hasContent: true;
};

type ActiveResource = {
  id: string;
  name: string;
  pending: false;
  version: number;
  error: null;
  hasContent: boolean;
  pdfExtractor?: string | null;
  processedAt?: number | null;
  status?: string | null;
  processingStage?: string | null;
  currentRunId?: string | null;
  stats?: {
    fragmentCount: number;
    pageCount: number | null;
    imageCount: number;
    wordCount: number;
  };
};

type AnyResource = ActiveResource | PendingResource;

export default function ResourceList({
  gameId,
  resourceList,
}: {
  gameId: string;
  resourceList: {
    id: string;
    name: string;
    url: string;
    version: number;
    hasContent: boolean;
    pdfExtractor?: string | null;
    processedAt?: number | null;
    status?: string | null;
    processingStage?: string | null;
    currentRunId?: string | null;
    stats?: {
      fragmentCount: number;
      pageCount: number | null;
      imageCount: number;
      wordCount: number;
    };
  }[];
}) {
  const router = useRouter();
  const { flash } = useFlashMessages();
  const workflowFlash = useWorkflowFlash();
  const { runTask } = useProcessing();

  const [allResources, setAllResources] = useState<AnyResource[]>(
    resourceList.map((r) => ({ ...r, pending: false, error: null }))
  );

  useEffect(() => {
    setAllResources((prevResources) => {
      const pendingResources: PendingResource[] = prevResources
        .filter((r) => r.pending)
        .map((r) => ({
          ...(r as PendingResource),
          error: null,
        }));

      return [
        ...resourceList.map(
          (r) => ({ ...r, pending: false, error: null } as ActiveResource)
        ),
        ...pendingResources,
      ];
    });
  }, [resourceList]);

  const handleAddResource = async (resource: PendingResource) => {
    const uploadMessage = flash(`Uploading resource ${resource.name}...`, "info", {
      removeAfter: null,
    });

    try {
      const formData = new FormData();
      formData.append('file', resource.file);
      formData.append('name', resource.name);

      // Note: Still using API route for resource creation because it handles FormData
      const response = await fetch(`/api/games/${gameId}/resources`, {
        method: 'POST',
        body: formData,
        credentials: 'same-origin',
      });

      if (!response.ok) {
        const errorBody = await response.json().catch(() => ({}));
        const errorMessage = typeof errorBody.error === 'string' ? errorBody.error : `Upload failed (${response.status})`;
        throw new Error(errorMessage);
      }

      const result = await response.json();

      uploadMessage.remove();

      if (result.currentRunId) {
        workflowFlash(
          result.currentRunId,
          {
            pending: `Processing ${resource.name}...`,
            success: `Processing completed for ${resource.name}`,
            failure: (error) => `Processing failed for ${resource.name}: ${error}`,
            cancelled: `Processing cancelled for ${resource.name}`,
          },
          {
            displayName: `Resource: ${resource.name}`,
            onComplete: () => {
              router.refresh();
            },
            onError: (error) => {
              console.error('Resource processing failed:', error);
              router.refresh();
            }
          }
        );

        // Remove from pending list and refresh to show processing status
        setAllResources((prev) => prev.filter((r) => r.id !== resource.id));
        router.refresh();
      } else if (result.status === "ready" || result.status === "completed") {
        // Unexpected immediate completion (shouldn't happen but handle it)
        flash(`Resource ${resource.name} processed successfully.`, "success", {
          removeAfter: 5000,
        });

        setAllResources((prev) => prev.filter((r) => r.id !== resource.id));
        router.refresh();
      } else {
        // No runId and not ready - unexpected state
        flash(`Resource ${resource.name} uploaded but processing status unknown.`, "info", {
          removeAfter: 8000,
        });

        setAllResources((prev) => prev.filter((r) => r.id !== resource.id));
        router.refresh();
      }
    } catch (err: unknown) {
      uploadMessage.update(
        err instanceof Error ? err.message : 'Failed to upload resource',
        'error',
        { removeAfter: 8000 }
      );
      setAllResources((prev) =>
        prev.map((r) =>
          r.id === resource.id ? { ...r, error: (err as any).message } : r
        )
      );
      flash(`Error adding ${resource.name}.`, "error", {
        removeAfter: 8000,
      });
    }
  };

  const handleFiles = (files: File[]) => {
    const newResources: PendingResource[] = files.map((r) => ({
      file: r,
      id: nanoid(),
      name: r.name,
      pending: true,
      hasContent: true,
    }));
    setAllResources((prev) => [...prev, ...newResources]);
    for (const resource of newResources) {
      handleAddResource(resource);
    }
  };

  return (
    <>
      {allResources.length === 0 ? (
        <FileUpload
          accept=".pdf"
          multiple
          onFilesSelected={handleFiles}
          buttonText="Add Resource"
          dropzoneText="Drop PDF files here or click to browse"
          variant="dropzone"
        />
      ) : (
        <div className="flex flex-col gap-4">
          <div className="flex justify-end">
            <FileUpload
              accept=".pdf"
              multiple
              onFilesSelected={handleFiles}
              buttonText="Add Resource"
              variant="button"
            />
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
            {allResources.map((resource) => {
              const stats = !resource.pending && resource.stats ? [
                resource.stats.pageCount && `${resource.stats.pageCount} pages`,
                resource.stats.imageCount > 0 && `${resource.stats.imageCount} images`,
                resource.stats.wordCount > 0 && `${(resource.stats.wordCount / 1000).toFixed(1)}k words`,
              ].filter(Boolean).join(", ") : null;

              return (
                <ClickableTableRow
                  key={resource.id}
                  href={`/admin/games/${gameId}/resources/${resource.id}`}
                >
                  <TableCell>
                    <div className="flex items-center gap-2">
                      {!resource.pending && (resource.status === "processing" || resource.status === "queued") && (
                        <Spinner size="sm" />
                      )}
                      <Link
                        href={`/admin/games/${gameId}/resources/${resource.id}`}
                        className="font-semibold text-primary hover:underline"
                        onClick={(event) => event.stopPropagation()}
                        onAuxClick={(event) => event.stopPropagation()}
                      >
                        {resource.name}
                      </Link>
                    </div>
                    {resource.error ? (
                      <>
                        <div className="text-destructive font-semibold">Failed to upload</div>
                        <div className="text-xs text-destructive mt-1">{resource.error}</div>
                      </>
                    ) : resource.pending ? (
                      <em>Pending</em>
                    ) : null}
                    {!resource.hasContent && !resource.pending && resource.status !== "processing" && resource.status !== "queued" ? (
                      <div className="text-destructive">Missing Content</div>
                    ) : null}
                    {!resource.pending && stats && resource.status !== "processing" && resource.status !== "queued" && (
                      <div className="text-xs text-muted-foreground mt-1">
                        {stats}
                      </div>
                    )}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground text-center">
                    {!resource.pending && resource.processedAt
                      ? new Date(resource.processedAt).toLocaleString()
                      : "-"}
                  </TableCell>
                  <TableCell className="text-center">
                    {!resource.pending && resource.version}
                  </TableCell>

                  <TableCell className="text-center gap-2 flex">
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={resource.pending}
                      onClick={async (e) => {
                        e.stopPropagation();

                        const stageMessages = getStageMessages('ingest', resource.name);
                        const displayName = getStageDisplayName('ingest', resource.name);
                        const optimisticMessage = flash(stageMessages.starting, "info", {
                          removeAfter: null,
                        });

                        let attachedToWorkflow = false;
                        try {
                          const result = await orpc.resources.reprocess({ id: resource.id });

                          if (result.runId) {
                            workflowFlash(
                              result.runId,
                              {
                                pending: stageMessages.pending,
                                success: stageMessages.success,
                                failure: (error) => stageMessages.failure(error),
                                cancelled: stageMessages.cancelled,
                              },
                              {
                                displayName,
                                existingMessage: optimisticMessage,
                                onComplete: () => {
                                  router.refresh();
                                },
                                onError: (error) => {
                                  console.error('Resource reprocessing failed:', error);
                                  router.refresh();
                                },
                              }
                            );
                            attachedToWorkflow = true;

                            // Refresh to show processing status
                            router.refresh();
                          } else {
                            optimisticMessage.update(stageMessages.success, "success", {
                              removeAfter: 5000,
                            });
                            router.refresh();
                          }
                        } catch (err: unknown) {
                          const errorMessage =
                            err instanceof Error ? err.message : "Unknown error";
                          optimisticMessage.update(
                            stageMessages.failure(errorMessage),
                            "error",
                            { removeAfter: 8000 }
                          );
                        } finally {
                          if (!attachedToWorkflow) {
                            optimisticMessage.remove();
                          }
                        }
                      }}
                    >
                      Reprocess
                    </Button>
                    <Button
                      size="sm"
                      variant="danger"
                      onClick={async (e) => {
                        e.stopPropagation();

                        try {
                          if (!resource.pending) {
                            await orpc.resources.deleteResource({ id: resource.id });
                          }
                          setAllResources((prev) =>
                            prev.filter((r) => r.id !== resource.id)
                          );
                          flash(`Resource ${resource.name} deleted.`, "success");
                        } catch (error) {
                          console.error('Failed to delete resource:', error);
                          flash(`Failed to delete ${resource.name}.`, "error");
                        }
                      }}
                    >
                      Delete
                    </Button>
                  </TableCell>
                </ClickableTableRow>
              );
            })}
          </TableBody>
        </Table>
        </div>
      )}
    </>
  );
}
