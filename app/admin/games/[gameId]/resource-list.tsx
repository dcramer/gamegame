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
import { deleteResource, createResource } from "@/lib/actions/resources";
import { Resource } from "@/lib/db/schema/resources";
import { nanoid } from "@/lib/utils";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { upload } from "@vercel/blob/client";

type PendingResource = {
  id: string;
  name: string;
  file: File;
  pending: true;
  error?: string | null;
};

type AnyResource =
  | {
      id: string;
      name: string;
      pending: false;
      error: null;
    }
  | PendingResource;

const bufferToBase64 = async (buffer: ArrayBuffer) => {
  // use a FileReader to generate a base64 data URI:
  const base64url: string = await new Promise((r) => {
    const reader = new FileReader();
    reader.onload = () => r(reader.result as string);
    reader.readAsDataURL(new Blob([buffer]));
  });
  // remove the `data:...;base64,` part from the start
  return base64url.slice(base64url.indexOf(",") + 1);
};

export default function ResourceList({
  gameId,
  resourceList,
}: {
  gameId: string;
  resourceList: (Resource & {
    id?: string;
  })[];
}) {
  const router = useRouter();

  const [allResources, setAllResources] = useState<AnyResource[]>(
    resourceList.map((r) => ({ ...r, pending: false, error: null }))
  );

  const handleAddResource = async (resource: PendingResource) => {
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
    } catch (err: unknown) {
      setAllResources((prev) =>
        prev.map((r) =>
          r.id === resource.id ? { ...r, error: (err as any).message } : r
        )
      );
    }
  };

  return (
    <ResourceDropzone
      onAddFiles={(files) => {
        const newResources: PendingResource[] = files.map((r) => ({
          file: r,
          id: nanoid(),
          name: r.name,
          pending: true,
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
                  </TableCell>
                  <TableCell className="text-center">
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
