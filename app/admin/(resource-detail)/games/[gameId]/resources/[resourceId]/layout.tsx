import { notFound } from "next/navigation";
import { api } from "@/lib/api/client";
import { PageHeader } from "@/components/page-header";
import { Breadcrumbs } from "@/components/breadcrumbs";
import AdminBaseLayout from "@/components/admin-base-layout";
import ResourceTabs from "./resource-tabs";
import ResourceActions from "./resource-actions";

export default async function Layout(props: {
  params: Promise<{ gameId: string; resourceId: string }>;
  children: React.ReactNode;
}) {
  const params = await props.params;
  const { children } = props;

  const resource = await api.resources.get(params.resourceId).catch(() => null);
  if (!resource) {
    notFound();
  }

  const game = await api.games.get(params.gameId).catch(() => null);
  if (!game) {
    notFound();
  }

  const stats = [
    `${resource.fragmentCount.toLocaleString()} chunks`,
    resource.pageCount && `${resource.pageCount} pages`,
    resource.imageCount > 0 && `${resource.imageCount} images`,
    resource.wordCount > 0 && `${(resource.wordCount / 1000).toFixed(1)}k words`,
  ]
    .filter(Boolean)
    .join(" • ");

  return (
    <AdminBaseLayout>
      <Breadcrumbs
        items={[
          { label: "Games", href: "/admin" },
          { label: game.name, href: `/admin/games/${game.id}` },
          { label: "Resources", href: `/admin/games/${game.id}/resources` },
          { label: resource.name },
        ]}
      />

      <PageHeader
        title={resource.name}
        stats={stats}
      />

      <ResourceTabs gameId={params.gameId} resourceId={params.resourceId}>
        <div className="flex flex-col lg:flex-row gap-8">
          {/* Left column - Content */}
          <div className="flex-1">
            {children}
          </div>

          {/* Right column - Actions sidebar */}
          <div className="lg:w-[380px]">
            <ResourceActions
              resourceId={params.resourceId}
              resourceName={resource.name}
              resourceUrl={resource.url}
              gameId={params.gameId}
            />
          </div>
        </div>
      </ResourceTabs>
    </AdminBaseLayout>
  );
}
