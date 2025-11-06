import { notFound } from "next/navigation";
import { getAttachment } from "@/lib/actions/attachments";
import AttachmentForm from "./attachment-form";

export default async function AttachmentDetailPage(props: {
  params: Promise<{
    gameId: string;
    attachmentId: string;
  }>;
}) {
  const params = await props.params;
  const attachment = await getAttachment(params.attachmentId);

  if (!attachment) {
    notFound();
  }

  return <AttachmentForm attachment={attachment} />;
}
