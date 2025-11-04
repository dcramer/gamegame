import { upload as vercelBlobUpload } from "@vercel/blob/client";

export async function upload(
  name: string,
  file: File,
  options: {
    access: "public";
    handleUploadUrl: string;
    clientPayload?: string;
  }
) {
  // TODO: this should look at config, but its not available on the client
  if (process.env.NODE_ENV === "development") {
    // if we're local, we're just pushing the file directly to the endpoint
    const formData = new FormData();
    formData.append("file", file);

    const response = await fetch(options.handleUploadUrl, {
      method: "POST",
      body: formData,
    });
    return response.json();
  }

  return vercelBlobUpload(name, file, options);
}
