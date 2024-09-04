"use client";

import ResourceDropzone from "@/components/resource-dropzone";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { uploadResource } from "@/lib/actions/resources";
import { Resource } from "@/lib/db/schema/resources";
import { nanoid } from "@/lib/utils";
import { useState } from "react";

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
  const [allResources, setAllResources] = useState<AnyResource[]>(
    resourceList.map((r) => ({ ...r, pending: false, error: null }))
  );

  const handleAddResource = async (resource: PendingResource) => {
    const reader = new FileReader();
    reader.onload = async () => {
      const content = await bufferToBase64(reader.result as ArrayBuffer);
      uploadResource({
        name: resource.name,
        gameId,
        content,
      })
        .then((newResource) => {
          setAllResources((prev) =>
            prev.map((r) =>
              r.id === resource.id
                ? { ...newResource, pending: false, error: null }
                : r
            )
          );
        })
        .catch((err) => {
          setAllResources((prev) =>
            prev.map((r) =>
              r.id === resource.id ? { ...r, error: err.message } : r
            )
          );
          throw err;
        });
    };
    reader.readAsArrayBuffer(resource.file);
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
            </TableRow>
          </TableHeader>
          <TableBody>
            {allResources.map((resource) => {
              return (
                <TableRow key={resource.id}>
                  <TableCell className="flex flex-col gap-1">
                    <strong>{resource.name}</strong>
                    {resource.error ? (
                      <div className="text-red-400">{resource.error}</div>
                    ) : resource.pending ? (
                      <em>Pending</em>
                    ) : null}
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
