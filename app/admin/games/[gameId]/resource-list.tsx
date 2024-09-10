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
import { upload } from "@vercel/blob/client";
import { useFlashMessages } from "@/components/flashMessages";

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
  }[];
}) {
  const router = useRouter();

  const [allResources, setAllResources] = useState<AnyResource[]>(
    resourceList.map((r) => ({ ...r, pending: false, error: null }))
  );

  useEffect(() => {
    const pendingResources: PendingResource[] = allResources
      .filter((r) => r.pending)
      .map((r) => ({
        ...(r as PendingResource),
        error: null,
      }));

    setAllResources([
      ...resourceList.map(
        (r) => ({ ...r, pending: false, error: null } as ActiveResource)
      ),
      ...pendingResources,
    ]);
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
      const newResource = await createResource({
        id: resource.id,
        name: resource.name,
        gameId,
        url: newBlob.url,
      });

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

  return (
    <ResourceDropzone
      onAddFiles={(files) => {
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
      }}
    >
      {allResources.length === 0 ? (
        <div className="flex flex-1 flex-col gap-6 items-center justify-center rounded-lg border border-dashed shadow-sm p-6 bg-muted min-h-64">
          <div className="flex flex-col items-center gap-1 text-center">
            <h3 className="text-2xl font-bold tracking-tight">
              There are no resources
            </h3>
            <p className="text-sm text-muted-foreground">
              Drag a PDF file of a rulebook here to add it to the game.
            </p>
          </div>
        </div>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Resource</TableHead>
              <TableHead className="w-[60px] text-center">Version</TableHead>
              <TableHead className="w-[200px] text-center">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {allResources.map((resource) => {
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
                      <div className="text-red-400">{resource.error}</div>
                    ) : resource.pending ? (
                      <em>Pending</em>
                    ) : null}
                    {!resource.hasContent ? (
                      <div className="text-red-400">Missing Content</div>
                    ) : null}
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
                          newResource = await reprocessResource(resource.id);
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
                        setAllResources(
                          allResources.map((r) =>
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
      )}
    </ResourceDropzone>
  );
}
