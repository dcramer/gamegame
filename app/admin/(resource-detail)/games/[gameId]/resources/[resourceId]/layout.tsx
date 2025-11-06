import { Suspense } from "react";
import { notFound } from "next/navigation";
import { serverClient } from "@/lib/procedures/client.server";
import { PageHeader } from "@/components/page-header";
import { Breadcrumbs } from "@/components/breadcrumbs";
import AdminBaseLayout from "@/components/admin-base-layout";
import ResourceTabs from "./resource-tabs";
import ResourceActions from "./resource-actions";

/**
 * Loading skeleton for resource header
 */
function ResourceHeaderLoading() {
  return (
    <>
      <div className="animate-pulse h-6 bg-gray-200 dark:bg-gray-800 rounded w-1/3 mb-4" />
      <PageHeader title="Loading resource..." />
    </>
  );
}

/**
 * Loading skeleton for resource actions
 */
function ResourceActionsLoading() {
  return (
    <div className="lg:w-[380px]">
      <div className="animate-pulse space-y-4">
        <div className="h-32 bg-gray-200 dark:bg-gray-800 rounded" />
      </div>
    </div>
  );
}

/**
 * Fetches and renders resource header
 */
async function ResourceHeader({ gameId, resourceId }: { gameId: string; resourceId: string }) {
  let resource, game;
  try {
    [resource, game] = await Promise.all([
      serverClient.resources.get({ id: resourceId }),
      serverClient.games.get({ idOrSlug: gameId }),
    ]);
  } catch (error) {
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
    <>
      <Breadcrumbs
        items={[
          { label: "Games", href: "/admin" },
          { label: game.name, href: `/admin/games/${game.id}` },
          { label: "Resources", href: `/admin/games/${game.id}/resources` },
          { label: resource.name },
        ]}
      />

      <PageHeader title={resource.name} stats={stats} />
    </>
  );
}

/**
 * Fetches and renders resource actions
 */
async function ResourceActionsWithData({ gameId, resourceId }: { gameId: string; resourceId: string }) {
  let resource;
  try {
    resource = await serverClient.resources.get({ id: resourceId });
  } catch (error) {
    notFound();
  }

  return (
    <div className="lg:w-[380px]">
      <ResourceActions
        resourceId={resourceId}
        resourceName={resource.name}
        resourceUrl={resource.url}
        gameId={gameId}
      />
    </div>
  );
}

/**
 * Resource layout with streaming data fetching
 * Uses Suspense boundaries to prevent blocking child rendering
 */
export default async function Layout(props: {
  params: Promise<{ gameId: string; resourceId: string }>;
  children: React.ReactNode;
}) {
  const params = await props.params;
  const { children } = props;

  return (
    <AdminBaseLayout>
      <Suspense fallback={<ResourceHeaderLoading />}>
        <ResourceHeader gameId={params.gameId} resourceId={params.resourceId} />
      </Suspense>

      <ResourceTabs gameId={params.gameId} resourceId={params.resourceId}>
        <div className="flex flex-col lg:flex-row gap-8">
          {/* Left column - Content */}
          <div className="flex-1">{children}</div>

          {/* Right column - Actions sidebar */}
          <Suspense fallback={<ResourceActionsLoading />}>
            <ResourceActionsWithData gameId={params.gameId} resourceId={params.resourceId} />
          </Suspense>
        </div>
      </ResourceTabs>
    </AdminBaseLayout>
  );
}
