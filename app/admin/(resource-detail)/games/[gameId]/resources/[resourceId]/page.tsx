import { notFound } from "next/navigation";
import { serverClient } from "@/lib/procedures/client.server";
import ResourceForm from "./form";

export const maxDuration = 300;

export default async function Page(
  props: {
    params: Promise<{ gameId: string; resourceId: string }>;
  }
) {
  const params = await props.params;

  // Fetch resource using oRPC server client
  let resource;
  try {
    resource = await serverClient.resources.get({ id: params.resourceId });
  } catch (error) {
    notFound();
  }

  return <ResourceForm resourceId={params.resourceId} initialData={resource} />;
}
