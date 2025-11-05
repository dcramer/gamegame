import { notFound } from "next/navigation";
import { getResource } from "@/lib/actions/resources";
import ResourceForm from "@/app/admin/games/[gameId]/[resourceId]/form";

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

  return <ResourceForm resourceId={params.resourceId} initialData={resource} />;
}
