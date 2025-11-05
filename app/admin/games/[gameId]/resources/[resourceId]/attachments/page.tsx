import { notFound } from "next/navigation";
import { getResource } from "@/lib/actions/resources";
import { getResourceAttachments } from "@/lib/actions/attachments";
import AttachmentList from "@/app/admin/games/[gameId]/[resourceId]/attachment-list";

export const maxDuration = 300;

export default async function Page(
  props: {
    params: Promise<{ gameId: string; resourceId: string }>;
  }
) {
  const params = await props.params;
  const resource = await getResource(params.resourceId, true);
  if (!resource) {
    notFound();
  }

  const attachments = await getResourceAttachments(params.resourceId);

  return (
    <div>
      <h4 className="text-lg font-semibold mb-4">Media Attachments</h4>
      <AttachmentList attachments={attachments} />
    </div>
  );
}
