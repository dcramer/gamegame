"use client";

import ResourceDropzone from "@/components/resource-dropzone";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  deleteResource,
  createResource,
  reprocessResource,
} from "@/lib/actions/resources";
import { nanoid } from "@/lib/utils";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
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
  processedAt?: Date | null;
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
    processedAt?: Date | null;
    stats?: {
      fragmentCount: number;
      pageCount: number | null;
      imageCount: number;
      wordCount: number;
    };
  }[];
}) {
  const router = useRouter();

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
    const message = flash(`Processing resource ${resource.name}...`, "info", {
      removeAfter: null,
    });

    const newBlob = await upload(resource.file.name, resource.file, {
      access: "public",
      handleUploadUrl: "/api/resources/upload",
      clientPayload: JSON.stringify({
        gameId,
        resourceId: resource.id,
        name: resource.name,
      }),
    });

    try {
      const newResource = await runTask(
        `Processing ${resource.name}`,
        createResource({
          id: resource.id,
          name: resource.name,
          gameId,
          url: newBlob.url,
        })
      );

      setAllResources((prev) =>
        prev.map((r) =>
          r.id === resource.id
            ? { ...newResource, pending: false, error: null }
            : r
        )
      );
      message.update(`Resource ${resource.name} saved.`, "success", {
        removeAfter: 8000,
      });
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

  const { flash } = useFlashMessages();
  const { runTask } = useProcessing();

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

  const triggerFileInput = (e: React.MouseEvent) => {
    e.stopPropagation();
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".pdf";
    input.multiple = true;
    input.onchange = (e) => {
      const files = Array.from(
        (e.target as HTMLInputElement).files || []
      );
      handleFiles(files);
    };
    input.click();
  };

  return (
    <ResourceDropzone onAddFiles={handleFiles}>
      {allResources.length === 0 ? (
        <div
          className="flex flex-1 flex-col gap-6 items-center justify-center rounded-lg border border-dashed shadow-sm p-6 bg-muted min-h-64 cursor-pointer hover:bg-muted/80 transition-colors"
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
            <Button onClick={triggerFileInput}>
              Add Resource
            </Button>
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
                        <div className="text-red-400 font-semibold">Failed to upload</div>
                        <div className="text-xs text-red-400 mt-1">{resource.error}</div>
                      </>
                    ) : resource.pending ? (
                      <em>Pending</em>
                    ) : null}
                    {!resource.hasContent ? (
                      <div className="text-red-400">Missing Content</div>
                    ) : null}
                    {!resource.pending && resource.pdfExtractor && (
                      <div className="text-xs text-muted-foreground mt-1">
                        Processed with {resource.pdfExtractor}
                        {stats && ` - ${stats}`}
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
                      variant="secondary"
                      disabled={resource.pending}
                      onClick={async (e) => {
                        e.stopPropagation();

                        const message = flash(
                          `Reprocessing resource ${resource.name}...`,
                          "info",
                          { removeAfter: null }
                        );
                        let newResource;
                        try {
                          newResource = await runTask(
                            `Reprocessing ${resource.name}`,
                            reprocessResource(resource.id)
                          );
                          // TODO: where the hell is the error???? a 504 timeout in prod
                          // seems to just fail silently here
                          if (!newResource) {
                            throw new Error("Failed to reprocess resource");
                          }
                        } catch (err: unknown) {
                          message.update(
                            `Error reprocessing ${resource.name}.`,
                            "error",
                            {
                              removeAfter: 8000,
                            }
                          );
                          throw err;
                        }
                        setAllResources((prev) =>
                          prev.map((r) =>
                            r.id === resource.id
                              ? { ...newResource, error: null, pending: false }
                              : r
                          )
                        );
                        message.update(
                          `Resource ${resource.name} updated.`,
                          "success",
                          {
                            removeAfter: 8000,
                          }
                        );
                      }}
                    >
                      Reprocess
                    </Button>
                    <Button
                      size="sm"
                      variant="destructive"
                      onClick={async (e) => {
                        e.stopPropagation();

                        if (!resource.pending) {
                          await deleteResource(resource.id);
                        }
                        setAllResources((prev) =>
                          prev.filter((r) => r.id !== resource.id)
                        );
                        flash(`Resource ${resource.name} deleted.`, "success");
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
    </ResourceDropzone>
  );
}
