import {
  type HandleUploadBody,
  handleUpload as vercelBlobHandleUpload,
} from "@vercel/blob/client";
import { put } from "@vercel/blob";
import { writeFile } from "node:fs/promises";
import path from "node:path";
import { env } from "@/lib/env.mjs";
import { nanoid } from "@/lib/utils";

export async function handleUpload({
  request,
  allowedContentTypes,
}: {
  request: any;
  allowedContentTypes: string[];
}) {
  if (!env.BLOB_READ_WRITE_TOKEN) {
    // if we're local, we're just writing the file directly to disk
    // and giving the client a url to the file using jank static serving

    const formData = await request.formData();
    const file = formData.get("file") as File;
    if (!file) {
      throw new Error("No file provided");
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const filename = encodeURIComponent(
      `${nanoid()}-${file.name.replaceAll(" ", "_")}`
    );

    await writeFile(path.join("public/uploads/" + filename), buffer);

    return {
      // Use relative URL for local static files
      url: `/uploads/${filename}`,
    };
  }

  const body = (await request.json()) as HandleUploadBody;

  return vercelBlobHandleUpload({
    body,
    request,
    onBeforeGenerateToken: async () => {
      return {
        allowedContentTypes,
      };
    },
    onUploadCompleted: async () => {},
  });
}

/**
 * Server-side upload function for directly uploading buffers/blobs
 */
export async function upload(
  filename: string,
  data: Blob | Buffer
): Promise<{ url: string }> {
  if (!env.BLOB_READ_WRITE_TOKEN) {
    // Local development: write directly to public/uploads
    let buffer: Buffer;
    if (data instanceof Buffer) {
      buffer = data;
    } else {
      buffer = Buffer.from(await (data as Blob).arrayBuffer());
    }

    // Preserve directory structure for structured paths (e.g., resources/xxx/attachments/yyy.png)
    // For flat uploads, add nanoid prefix to avoid collisions
    let safeFilename: string;
    if (filename.includes('/')) {
      // Structured path - preserve it
      safeFilename = filename.replaceAll(" ", "_");

      // Create parent directories if needed
      const dirPath = path.dirname(path.join("public/uploads", safeFilename));
      const { mkdir } = await import("node:fs/promises");
      await mkdir(dirPath, { recursive: true });
    } else {
      // Flat filename - add nanoid prefix
      safeFilename = `${nanoid()}-${filename.replaceAll(" ", "_")}`;
    }

    await writeFile(path.join("public/uploads", safeFilename), buffer);

    return {
      // Use relative URL for local static files
      url: `/uploads/${safeFilename}`,
    };
  }

  // Production: use Vercel Blob
  const blob = await put(filename, data, {
    access: "public",
  });

  return {
    url: blob.url,
  };
}
