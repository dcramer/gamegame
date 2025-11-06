import { notFound } from "next/navigation";
import { api } from "@/lib/api/client";
import AttachmentForm from "./attachment-form";

export default async function AttachmentDetailPage(props: {
  params: Promise<{
    gameId: string;
    attachmentId: string;
  }>;
}) {
  const params = await props.params;
  const attachment = await api.attachments.get(params.attachmentId).catch(() => null);

  if (!attachment) {
    notFound();
  }

  return <AttachmentForm attachment={attachment} />;
}
