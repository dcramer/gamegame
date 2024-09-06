"use client";

import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import Link from "next/link";
import { deleteGame } from "@/lib/actions/games";
import { useEffect, useState } from "react";
import { deleteBlob } from "@/lib/actions/blobs";

export default function BlobList({
  blobList,
}: {
  blobList: {
    url: string;
  }[];
}) {
  const [activeBlobList, setBlobList] = useState(blobList);

  useEffect(() => {
    setBlobList(blobList);
  }, [blobList]);

  return activeBlobList.length === 0 ? (
    <div className="flex flex-1 flex-col gap-6 items-center justify-center rounded-lg border border-dashed shadow-sm p-6 bg-muted min-h-64">
      <div className="flex flex-col items-center gap-1 text-center">
        <h3 className="text-2xl font-bold tracking-tight">
          There are no blobs to show
        </h3>
      </div>
    </div>
  ) : (
    <div className="flex flex-col gap-4">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Name</TableHead>
            <TableHead className="w-[200px] text-center">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {activeBlobList.map((blob) => {
            return (
              <TableRow key={blob.url}>
                <TableCell className="font-medium relative">
                  <a href={blob.url} className="w-full block">
                    {blob.url}
                  </a>
                </TableCell>
                <TableCell className="text-center">
                  <Button
                    size="sm"
                    variant="destructive"
                    onClick={async (e) => {
                      e.stopPropagation();
                      setBlobList(
                        activeBlobList.filter((b) => b.url !== blob.url)
                      );
                      await deleteBlob(blob.url).catch((err) => {
                        setBlobList([blob, ...activeBlobList]);
                      });
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
  );
}
