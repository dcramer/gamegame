import { Suspense } from "react";
import { notFound } from "next/navigation";
import { serverClient } from "@/lib/procedures/client.server";
import { PageHeader } from "@/components/page-header";
import { Breadcrumbs } from "@/components/breadcrumbs";
import AdminBaseLayout from "@/components/admin-base-layout";
import AttachmentActions from "./attachment-actions";
import { db } from "@/lib/db";
import { resources } from "@/lib/db/schema/resources";
import { eq } from "drizzle-orm";

/**
 * Loading skeleton for attachment header
 */
function AttachmentHeaderLoading() {
  return (
    <>
      <div className="animate-pulse h-6 bg-gray-200 dark:bg-gray-800 rounded w-1/3 mb-4" />
      <PageHeader title="Loading attachment..." />
    </>
  );
}

/**
 * Loading skeleton for attachment actions
 */
function AttachmentActionsLoading() {
  return (
    <div className="lg:w-[380px]">
      <div className="animate-pulse space-y-4">
        <div className="h-32 bg-gray-200 dark:bg-gray-800 rounded" />
      </div>
    </div>
  );
}

/**
 * Fetches and renders attachment header
 */
async function AttachmentHeader({ gameId, attachmentId }: { gameId: string; attachmentId: string }) {
  let attachment, game;
  try {
    [attachment, game] = await Promise.all([
      serverClient.attachments.get({ id: attachmentId }),
      serverClient.games.get({ idOrSlug: gameId }),
    ]);
  } catch (error) {
    notFound();
  }

  // Get resource from attachment
  const [resourceData] = await db
    .select({
      id: resources.id,
      name: resources.name,
    })
    .from(resources)
    .where(eq(resources.id, attachment.resourceId!))
    .limit(1);

  if (!resourceData) {
    notFound();
  }

  const attachmentName =
    attachment.originalFilename ||
    attachment.description ||
    `Attachment ${attachment.id}`;

  const stats = attachment.pageNumber ? `Page ${attachment.pageNumber}` : undefined;

  return (
    <>
      <Breadcrumbs
        items={[
          { label: "Games", href: "/admin" },
          { label: game.name, href: `/admin/games/${game.id}` },
          { label: "Resources", href: `/admin/games/${game.id}/resources` },
          {
            label: resourceData.name,
            href: `/admin/games/${game.id}/resources/${resourceData.id}`,
          },
          {
            label: "Attachments",
            href: `/admin/games/${game.id}/resources/${resourceData.id}/attachments`,
          },
          { label: attachmentName },
        ]}
      />

      <PageHeader title={attachmentName} stats={stats} />
    </>
  );
}

/**
 * Fetches and renders attachment actions
 */
async function AttachmentActionsWithData({ gameId, attachmentId }: { gameId: string; attachmentId: string }) {
  let attachment;
  try {
    attachment = await serverClient.attachments.get({ id: attachmentId });
  } catch (error) {
    notFound();
  }

  return (
    <div className="lg:w-[380px]">
      <AttachmentActions
        attachmentId={attachmentId}
        attachmentUrl={attachment.url}
        attachmentType={attachment.type}
        gameId={gameId}
      />
    </div>
  );
}

/**
 * Attachment layout with streaming data fetching
 * Uses Suspense boundaries to prevent blocking child rendering
 */
export default async function Layout(props: {
  params: Promise<{ gameId: string; attachmentId: string }>;
  children: React.ReactNode;
}) {
  const params = await props.params;
  const { children } = props;

  return (
    <AdminBaseLayout>
      <Suspense fallback={<AttachmentHeaderLoading />}>
        <AttachmentHeader gameId={params.gameId} attachmentId={params.attachmentId} />
      </Suspense>

      <div className="flex flex-col lg:flex-row gap-8">
        {/* Left column - Content */}
        <div className="flex-1">{children}</div>

        {/* Right column - Actions sidebar */}
        <Suspense fallback={<AttachmentActionsLoading />}>
          <AttachmentActionsWithData gameId={params.gameId} attachmentId={params.attachmentId} />
        </Suspense>
      </div>
    </AdminBaseLayout>
  );
}
