import { notFound } from "next/navigation";
import { api } from "@/lib/api/client";
import ResourceForm from "./form";

export const maxDuration = 300;

export default async function Page(
  props: {
    params: Promise<{ gameId: string; resourceId: string }>;
  }
) {
  const params = await props.params;
  const resource = await api.resources.get(params.resourceId).catch(() => null);
  if (!resource) {
    notFound();
  }

  return <ResourceForm resourceId={params.resourceId} initialData={resource} />;
}
