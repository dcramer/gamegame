import { db } from "@/lib/db";
import { games, resources } from "@/lib/db/schema";
import { eq, or } from "drizzle-orm";
import { notFound } from "next/navigation";
import ResourceList from "../resource-list";

export const maxDuration = 300;

export default async function Page(props: { params: Promise<{ gameId: string }> }) {
  const params = await props.params;

  // Fetch game directly from database (Server Component)
  const [game] = await db
    .select({
      id: games.id,
      name: games.name,
    })
    .from(games)
    .where(or(eq(games.slug, params.gameId), eq(games.id, params.gameId)))
    .limit(1);

  if (!game) {
    notFound();
  }

  // Fetch resources for this game
  const resourceList = await db
    .select({
      id: resources.id,
      gameId: resources.gameId,
      name: resources.name,
      originalFilename: resources.originalFilename,
      url: resources.url,
      content: resources.content,
      version: resources.version,
      pdfExtractor: resources.pdfExtractor,
      processedAt: resources.processedAt,
      status: resources.status,
      currentRunId: resources.currentRunId,
      processingStage: resources.processingStage,
      pageCount: resources.pageCount,
      imageCount: resources.imageCount,
      wordCount: resources.wordCount,
      description: resources.description,
      resourceType: resources.resourceType,
      edition: resources.edition,
      createdAt: resources.createdAt,
      updatedAt: resources.updatedAt,
    })
    .from(resources)
    .where(eq(resources.gameId, game.id))
    .orderBy(resources.name);

  return <ResourceList gameId={game.id} resourceList={resourceList} />;
}
