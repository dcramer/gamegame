import { getResource } from "@/lib/actions/resources";
import { redirect } from "next/navigation";

export async function GET(req: Request, props: { params: Promise<{ resourceId: string }> }) {
  const params = await props.params;

  const {
    resourceId
  } = params;

  const resource = await getResource(resourceId);
  if (!resource) {
    return Response.json({ error: "Resource not found" }, { status: 404 });
  }

  return redirect(resource.url);
}
