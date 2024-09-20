import {
  type HandleUploadBody,
  handleUpload as vercelBlobHandleUpload,
} from "@vercel/blob/client";
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
      // TODO: how do we request.host
      url: `http://localhost:3000/uploads/${filename}`,
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
