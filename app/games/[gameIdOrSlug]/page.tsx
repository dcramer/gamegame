import { notFound } from 'next/navigation';
import { db } from '@/lib/db';
import { games, resources, bggGames } from '@/lib/db/schema';
import { eq, or } from 'drizzle-orm';
import { Chat } from '@/components/chat';
import { verifySession } from '@/lib/session';

interface Game {
  id: string;
  name: string;
  slug: string;
  year?: number | null;
  imageUrl: string | null;
  bggUrl: string | null;
  resourceCount?: number;
  bggGame?: {
    yearPublished: number | null;
    minPlayers: number | null;
    maxPlayers: number | null;
    playingTime: number | null;
    designers: string[] | null;
    publishers: string[] | null;
  } | null;
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

  // Get BGG metadata if available
  let bggGame = null;
  if (game.bggId) {
    const [bggData] = await db
      .select({
        yearPublished: bggGames.yearPublished,
        minPlayers: bggGames.minPlayers,
        maxPlayers: bggGames.maxPlayers,
        playingTime: bggGames.playingTime,
        designers: bggGames.designers,
        publishers: bggGames.publishers,
      })
      .from(bggGames)
      .where(eq(bggGames.id, game.bggId))
      .limit(1);

    bggGame = bggData || null;
  }

  return {
    ...game,
    resourceCount: resourceCount.length,
    bggGame,
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

  const user = await verifySession();

  return (
    <div className="relative h-screen">
      <Chat game={game} isAdmin={user?.isAdmin ?? false} />
    </div>
  );
}
