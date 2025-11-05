import { notFound } from 'next/navigation';
import { db } from '@/lib/db';
import { games, resources } from '@/lib/db/schema';
import { eq, or } from 'drizzle-orm';
import { Chat } from '@/components/chat';

interface Game {
  id: string;
  name: string;
  slug: string;
  year?: number | null;
  imageUrl: string | null;
  bggUrl: string | null;
  resourceCount?: number;
}

async function getGame(gameIdOrSlug: string): Promise<Game | null> {
  // Support both slug and ID lookups
  const [game] = await db
    .select({
      id: games.id,
      name: games.name,
      year: games.year,
      slug: games.slug,
      imageUrl: games.imageUrl,
      bggId: games.bggId,
      bggUrl: games.bggUrl,
    })
    .from(games)
    .where(or(eq(games.slug, gameIdOrSlug), eq(games.id, gameIdOrSlug)))
    .limit(1);

  if (!game) {
    return null;
  }

  // Get resource count
  const resourceCount = await db
    .select({ count: resources.id })
    .from(resources)
    .where(eq(resources.gameId, game.id));

  return {
    ...game,
    resourceCount: resourceCount.length,
  };
}

export default async function GameChatPage({
  params,
}: {
  params: Promise<{ gameIdOrSlug: string }>;
}) {
  const { gameIdOrSlug } = await params;
  const game = await getGame(gameIdOrSlug);

  if (!game) {
    notFound();
  }

  return (
    <div className="relative h-screen">
      <Chat game={game} />
    </div>
  );
}
