import { notFound } from "next/navigation";
import { serverClient } from "@/lib/procedures/client.server";
import { PageHeader } from "@/components/page-header";
import { Breadcrumbs } from "@/components/breadcrumbs";
import AdminBaseLayout from "@/components/admin-base-layout";
import AttachmentActions from "./attachment-actions";
import { db } from "@/lib/db";
import { resources } from "@/lib/db/schema/resources";
import { eq } from "drizzle-orm";

export default async function Layout(props: {
  params: Promise<{ gameId: string; attachmentId: string }>;
  children: React.ReactNode;
}) {
  const params = await props.params;
  const { children } = props;

  let attachment, game;
  try {
    [attachment, game] = await Promise.all([
      serverClient.attachments.get({ id: params.attachmentId }),
      serverClient.games.get({ idOrSlug: params.gameId }),
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
    <AdminBaseLayout>
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

      <div className="flex flex-col lg:flex-row gap-8">
        {/* Left column - Content */}
        <div className="flex-1">{children}</div>

        {/* Right column - Actions sidebar */}
        <div className="lg:w-[380px]">
          <AttachmentActions
            attachmentId={params.attachmentId}
            attachmentUrl={attachment.url}
            attachmentType={attachment.type}
            gameId={params.gameId}
          />
        </div>
      </div>
    </AdminBaseLayout>
  );
}
