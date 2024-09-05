import { getResource } from "@/lib/actions/resources";
import { redirect } from "next/navigation";

export async function GET(
  req: Request,
  { params: { resourceId } }: { params: { resourceId: string } }
) {
  const resource = await getResource(resourceId);
  if (!resource) {
    return Response.json({ error: "Resource not found" }, { status: 404 });
  }

  return redirect(resource.url);
}
