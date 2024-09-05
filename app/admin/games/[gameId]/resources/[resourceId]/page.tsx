import { notFound, redirect } from "next/navigation";
import { getResource, updateResource } from "@/lib/actions/resources";
import { Button } from "@/components/ui/button";

export default async function Page({
  params,
}: {
  params: { gameId: string; resourceId: string };
}) {
  const resource = await getResource(params.resourceId);
  if (!resource) {
    notFound();
  }

  return (
    <div>
      <h3 className="text-2xl text-muted-foreground font-semibold mb-4">
        {resource.name}
      </h3>
      <form
        action={async (formData) => {
          "use server";
          await updateResource({
            id: params.resourceId,
            content: formData.get("content") as string,
          });
          redirect(`/admin/games/${params.gameId}`);
        }}
        className="flex items-center w-full flex-col gap-4"
      >
        <textarea
          rows={24}
          name="content"
          className="w-full rounded flex-1 whitespace-pre-wrap bg-accent text-accent-foreground p-4"
        >
          {resource.content}
        </textarea>
        <div className="max-w-lg">
        <Button type="submit" className="w-full">
          Update Content
        </Button>
        </div>
      </form>
    </div>
  );
}
