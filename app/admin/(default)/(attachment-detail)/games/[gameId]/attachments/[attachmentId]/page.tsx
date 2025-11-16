import { handleServerError } from "@/lib/errors";
import { serverClient } from "@/lib/procedures/client.server";
import AttachmentForm from "./attachment-form";

export default async function AttachmentDetailPage(props: {
  params: Promise<{
    gameId: string;
    attachmentId: string;
  }>;
}) {
  const params = await props.params;

  let attachment;
  try {
    attachment = await serverClient.attachments.get({ id: params.attachmentId });
  } catch (error) {
    handleServerError(error);
  }

  return <AttachmentForm attachment={attachment} />;
}
