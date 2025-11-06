import { db } from "@/lib/db";
import { games } from "@/lib/db/schema";
import { eq, or } from "drizzle-orm";
import { notFound } from "next/navigation";
import Form from "./form";

export const maxDuration = 300;

export default async function Page(props: { params: Promise<{ gameId: string }> }) {
  const params = await props.params;

  // Fetch game directly from database (Server Component)
  const [game] = await db
    .select({
      id: games.id,
      name: games.name,
      year: games.year,
      slug: games.slug,
      imageUrl: games.imageUrl,
      bggId: games.bggId,
      bggUrl: games.bggUrl,
      createdAt: games.createdAt,
      updatedAt: games.updatedAt,
    })
    .from(games)
    .where(or(eq(games.slug, params.gameId), eq(games.id, params.gameId)))
    .limit(1);

  if (!game) {
    notFound();
  }

  return <Form game={game} />;
}
