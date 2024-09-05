import { notFound, redirect } from "next/navigation";
import { getResource, updateResource } from "@/lib/actions/resources";
import { DownloadIcon } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";

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
      <div className="flex items-center gap-4 mb-4">
        <h3 className="text-2xl text-muted-foreground font-semibold">
          {resource.name}
        </h3>
        <Button asChild size="sm">
          <Link href={resource.url} prefetch={false}>
            <DownloadIcon className="h-5 w-5" />
          </Link>
        </Button>
      </div>

      <form
        action={async (formData) => {
          "use server";
          await updateResource(params.resourceId, {
            name: formData.get("name") as string,
          });
          redirect(`/admin/games/${params.gameId}`);
        }}
        className="grid gap-4"
      >
        <div className="grid gap-2">
          <Label htmlFor="name">Name</Label>
          <Input
            id="name"
            type="text"
            name="name"
            defaultValue={resource.name}
            placeholder="Game Manual.pdf"
            required
          />
        </div>
        <Button type="submit" className="mr-auto">
          Update Resource
        </Button>
      </form>
    </div>
  );
}
