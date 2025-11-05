import { notFound } from "next/navigation";
import { getResource } from "@/lib/actions/resources";
import { getGame } from "@/lib/actions/games";
import { PageHeader } from "@/components/page-header";
import ResourceTabs from "./resource-tabs";
import ResourceActions from "@/app/admin/games/[gameId]/[resourceId]/resource-actions";

export default async function Layout(props: {
  params: Promise<{ gameId: string; resourceId: string }>;
  children: React.ReactNode;
}) {
  const params = await props.params;
  const { children } = props;

  const resource = await getResource(params.resourceId, true);
  if (!resource) {
    notFound();
  }

  const game = await getGame(params.gameId);
  if (!game) {
    notFound();
  }

  const stats = [
    `${resource.embeddingCount.toLocaleString()} chunks`,
    resource.pageCount && `${resource.pageCount} pages`,
    resource.imageCount > 0 && `${resource.imageCount} images`,
    resource.wordCount > 0 && `${(resource.wordCount / 1000).toFixed(1)}k words`,
  ]
    .filter(Boolean)
    .join(" • ");

  return (
    <>
      <PageHeader
        breadcrumbs={[
          { label: "Admin", href: "/admin" },
          { label: "Games", href: "/admin" },
          { label: game.name, href: `/admin/games/${params.gameId}` },
          { label: resource.name },
        ]}
        title={resource.name}
        stats={stats}
      />

      <ResourceTabs gameId={params.gameId} resourceId={params.resourceId}>
        <div className="grid grid-cols-1 lg:grid-cols-[1fr,380px] gap-8">
          {/* Left column - Content */}
          <div>{children}</div>

          {/* Right column - Actions sidebar */}
          <div className="lg:sticky lg:top-8 lg:self-start">
            <ResourceActions
              resourceId={params.resourceId}
              resourceName={resource.name}
              resourceUrl={resource.url}
              gameId={params.gameId}
            />
          </div>
        </div>
      </ResourceTabs>
    </>
  );
}
