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
import { Spinner } from "@/components/ui/spinner";
import { api } from "@/lib/api/client";
import { nanoid } from "@/lib/utils";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, useCallback } from "react";
import { upload } from "@/lib/uploads/client";
import { useFlashMessages } from "@/components/flashMessages";
import { useProcessing } from "@/components/processing-provider";

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
  const { runTask } = useProcessing();

  const [allResources, setAllResources] = useState<AnyResource[]>(
    resourceList.map((r) => ({ ...r, pending: false, error: null }))
  );

  // Track resources that need polling (status is "processing")
  const [processingResources, setProcessingResources] = useState<Set<string>>(new Set());

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

    // Update processing resources set
    const processingIds = new Set(
      resourceList
        .filter((r) => r.status === "processing" || r.status === "queued")
        .map((r) => r.id)
    );
    setProcessingResources(processingIds);
  }, [resourceList]);

  // Poll for resource status updates
  const checkResourceStatus = useCallback(async (resourceId: string) => {
    try {
      const response = await fetch(`/api/resources/${resourceId}`);
      if (!response.ok) {
        console.error(`Failed to check status for resource ${resourceId}`);
        return null;
      }
      return await response.json();
    } catch (error) {
      console.error(`Error checking resource status ${resourceId}:`, error);
      return null;
    }
  }, []);

  useEffect(() => {
    if (processingResources.size === 0) return;

    const interval = setInterval(async () => {
      const updates: { resourceId: string; shouldRemove: boolean; shouldRefresh: boolean }[] = [];

      for (const resourceId of processingResources) {
        const resource = await checkResourceStatus(resourceId);

        if (!resource) continue;

        if (resource.status === "ready" || resource.status === "completed") {
          updates.push({ resourceId, shouldRemove: true, shouldRefresh: true });
          flash(`Resource processed successfully!`, "success", { removeAfter: 5000 });
        } else if (resource.status === "failed") {
          updates.push({ resourceId, shouldRemove: true, shouldRefresh: false });
          flash(`Resource processing failed`, "error", { removeAfter: 8000 });
        }
      }

      if (updates.length > 0) {
        // Remove completed/failed resources from processing set
        setProcessingResources((prev) => {
          const next = new Set(prev);
          updates.forEach(({ resourceId, shouldRemove }) => {
            if (shouldRemove) next.delete(resourceId);
          });
          return next;
        });

        // Refresh the page to show updated data
        if (updates.some(({ shouldRefresh }) => shouldRefresh)) {
          router.refresh();
        }
      }
    }, 3000); // Poll every 3 seconds

    return () => clearInterval(interval);
  }, [processingResources, checkResourceStatus, flash, router]);

  const handleAddResource = async (resource: PendingResource) => {
    const message = flash(`Uploading resource ${resource.name}...`, "info", {
      removeAfter: null,
    });

    try {
      const formData = new FormData();
      formData.append('file', resource.file);
      formData.append('name', resource.name);

      const result = await api.resources.create(gameId, formData);

      if (result.status === "processing" || result.status === "pending") {
        // Add to processing set for polling
        setProcessingResources((prev) => new Set(prev).add(result.id));

        message.update(
          `Resource ${resource.name} queued for processing. This may take a few minutes...`,
          "info",
          { removeAfter: 8000 }
        );

        // Remove from pending list and refresh to show processing status
        setAllResources((prev) => prev.filter((r) => r.id !== resource.id));
        router.refresh();
      } else {
        // Unexpected immediate completion (shouldn't happen but handle it)
        message.update(`Resource ${resource.name} processed successfully.`, "success", {
          removeAfter: 5000,
        });

        setAllResources((prev) => prev.filter((r) => r.id !== resource.id));
        router.refresh();
      }
    } catch (err: unknown) {
      setAllResources((prev) =>
        prev.map((r) =>
          r.id === resource.id ? { ...r, error: (err as any).message } : r
        )
      );
      message.update(`Error adding ${resource.name}.`, "error", {
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
                <TableRow key={resource.id}>
                  <TableCell className="relative">
                    <Link
                      href={`/admin/games/${gameId}/resources/${resource.id}`}
                      prefetch={false}
                      className="absolute inset-0"
                      onClick={(e) => {
                        e.stopPropagation();
                        router.push(
                          `/admin/games/${gameId}/resources/${resource.id}`
                        );
                      }}
                    />
                    <div>
                      <strong>{resource.name}</strong>
                    </div>
                    {resource.error ? (
                      <>
                        <div className="text-destructive font-semibold">Failed to upload</div>
                        <div className="text-xs text-destructive mt-1">{resource.error}</div>
                      </>
                    ) : resource.pending ? (
                      <em>Pending</em>
                    ) : !resource.pending && (resource.status === "processing" || resource.status === "queued") ? (
                      <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <Spinner size="sm" />
                        <span>
                          Processing...
                          {resource.processingStage && resource.processingStage !== "ready" &&
                            ` (${resource.processingStage})`
                          }
                        </span>
                      </div>
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
                      disabled={resource.pending || (!resource.pending && (resource.status === "processing" || resource.status === "queued"))}
                      onClick={async (e) => {
                        e.stopPropagation();

                        const message = flash(
                          `Reprocessing resource ${resource.name}...`,
                          "info",
                          { removeAfter: null }
                        );

                        try {
                          // TODO: Add reprocess to API client
                          const response = await fetch(`/api/resources/${resource.id}/reprocess`, {
                            method: 'POST',
                            credentials: 'same-origin',
                          });
                          const result = await response.json();

                          if (result.status === "processing") {
                            // Add to processing set for polling
                            setProcessingResources((prev) => new Set(prev).add(result.id));

                            message.update(
                              `Resource ${resource.name} queued for reprocessing. This may take a few minutes...`,
                              "info",
                              { removeAfter: 8000 }
                            );

                            // Refresh to show processing status
                            router.refresh();
                          } else {
                            // Unexpected immediate completion
                            message.update(
                              `Resource ${resource.name} reprocessed successfully.`,
                              "success",
                              { removeAfter: 5000 }
                            );
                            router.refresh();
                          }
                        } catch (err: unknown) {
                          message.update(
                            `Error reprocessing ${resource.name}.`,
                            "error",
                            { removeAfter: 8000 }
                          );
                        }
                      }}
                    >
                      Reprocess
                    </Button>
                    <Button
                      size="sm"
                      variant="destructive"
                      onClick={async (e) => {
                        e.stopPropagation();

                        try {
                          if (!resource.pending) {
                            await api.resources.delete(resource.id);
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
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
        </div>
      )}
    </>
  );
}
