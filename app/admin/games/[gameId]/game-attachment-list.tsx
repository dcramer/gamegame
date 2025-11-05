"use client";

import Image from "next/image";
import Link from "next/link";
import { FileIcon, CheckCircle2, XCircle, ChevronDown, ChevronUp } from "lucide-react";
import { useState } from "react";

type Attachment = {
  id: string;
  type: string;
  url: string;
  mimeType: string | null;
  originalFilename: string | null;
  pageNumber: number | null;
  bbox?: number[];
  caption: string | null;
  width: number | null;
  height: number | null;
  description: string | null;
  isGoodQuality: "good" | "bad" | null;
  resourceId: string;
  resourceName: string;
};

export default function GameAttachmentList({
  attachments,
  gameId,
}: {
  attachments: Attachment[];
  gameId: string;
}) {
  const [expandedDescriptions, setExpandedDescriptions] = useState<Set<string>>(new Set());

  const toggleDescription = (id: string) => {
    setExpandedDescriptions((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  if (attachments.length === 0) {
    return (
      <div className="text-sm text-muted-foreground">
        No media attachments found for this game.
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
      {attachments.map((attachment) => {
        const isDescriptionExpanded = expandedDescriptions.has(attachment.id);

        return (
          <div
            key={attachment.id}
            className="border rounded-lg overflow-hidden hover:border-primary transition-colors"
          >
            <a
              href={attachment.url}
              target="_blank"
              rel="noopener noreferrer"
              className="block"
            >
              {attachment.type === "image" && attachment.mimeType?.startsWith("image/") ? (
                <div className="relative aspect-square bg-muted flex items-center justify-center">
                  <Image
                    src={attachment.url}
                    alt={attachment.caption || attachment.originalFilename || "Attachment"}
                    fill
                    className="object-contain"
                    sizes="(max-width: 640px) 50vw, (max-width: 768px) 33vw, (max-width: 1024px) 25vw, 20vw"
                    unoptimized
                  />
                  {/* Quality badge in top-right corner */}
                  {attachment.isGoodQuality && (
                    <div className="absolute top-2 right-2">
                      {attachment.isGoodQuality === "good" ? (
                        <CheckCircle2 className="h-5 w-5 text-green-600 bg-white rounded-full" />
                      ) : (
                        <XCircle className="h-5 w-5 text-red-600 bg-white rounded-full" />
                      )}
                    </div>
                  )}
                </div>
              ) : (
                <div className="relative aspect-square bg-muted flex items-center justify-center">
                  <FileIcon className="h-12 w-12 text-muted-foreground" />
                </div>
              )}
            </a>
            <div className="p-2 space-y-1">
              <div className="flex items-center justify-between gap-1">
                {attachment.pageNumber && (
                  <p className="text-xs text-muted-foreground">
                    Page {attachment.pageNumber}
                  </p>
                )}
                {attachment.isGoodQuality && (
                  <div className="flex items-center gap-1">
                    {attachment.isGoodQuality === "good" ? (
                      <CheckCircle2 className="h-3 w-3 text-green-600" />
                    ) : (
                      <XCircle className="h-3 w-3 text-red-600" />
                    )}
                    <span className="text-xs text-muted-foreground">
                      {attachment.isGoodQuality}
                    </span>
                  </div>
                )}
              </div>

              {/* Resource name with link */}
              <Link
                href={`/admin/games/${gameId}/resources/${attachment.resourceId}`}
                className="text-xs text-primary hover:underline block truncate"
                title={attachment.resourceName}
              >
                {attachment.resourceName}
              </Link>

              {attachment.caption && (
                <p className="text-xs line-clamp-2" title={attachment.caption}>
                  {attachment.caption}
                </p>
              )}
              {attachment.description && (
                <div className="border-t pt-1 mt-1">
                  <button
                    onClick={(e) => {
                      e.preventDefault();
                      toggleDescription(attachment.id);
                    }}
                    className="flex items-center gap-1 text-xs text-primary hover:underline w-full"
                  >
                    {isDescriptionExpanded ? (
                      <>
                        <ChevronUp className="h-3 w-3" />
                        Hide description
                      </>
                    ) : (
                      <>
                        <ChevronDown className="h-3 w-3" />
                        Show description
                      </>
                    )}
                  </button>
                  {isDescriptionExpanded && (
                    <p className="text-xs text-muted-foreground mt-1">
                      {attachment.description}
                    </p>
                  )}
                </div>
              )}
              {attachment.originalFilename && (
                <p className="text-xs text-muted-foreground font-mono truncate" title={attachment.originalFilename}>
                  {attachment.originalFilename}
                </p>
              )}
              {attachment.width && attachment.height && (
                <p className="text-xs text-muted-foreground">
                  {attachment.width} × {attachment.height}
                </p>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
