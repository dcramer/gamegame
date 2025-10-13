import Image from "next/image";
import { FileIcon } from "lucide-react";

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
};

export default function AttachmentList({
  attachments,
}: {
  attachments: Attachment[];
}) {
  if (attachments.length === 0) {
    return (
      <div className="text-sm text-muted-foreground">
        No media attachments found for this resource.
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
      {attachments.map((attachment) => (
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
              </div>
            ) : (
              <div className="relative aspect-square bg-muted flex items-center justify-center">
                <FileIcon className="h-12 w-12 text-muted-foreground" />
              </div>
            )}
            <div className="p-2 space-y-1">
              {attachment.pageNumber && (
                <p className="text-xs text-muted-foreground">
                  Page {attachment.pageNumber}
                </p>
              )}
              {attachment.caption && (
                <p className="text-xs line-clamp-2" title={attachment.caption}>
                  {attachment.caption}
                </p>
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
          </a>
        </div>
      ))}
    </div>
  );
}
