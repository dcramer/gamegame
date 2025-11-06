import AdminLayout from '@/components/admin-layout';
import { db } from '@/lib/db';
import { games, resources } from '@/lib/db/schema';
import { eq, sql } from 'drizzle-orm';
import GameList from './game-list';

export default async function Page() {
  // Fetch games directly from database (Server Component)
  const gameList = await db
    .select({
      id: games.id,
      name: games.name,
      year: games.year,
      slug: games.slug,
      imageUrl: games.imageUrl,
      bggId: games.bggId,
      bggUrl: games.bggUrl,
      resourceCount: sql<number>`COUNT(DISTINCT ${resources.id})`.mapWith(Number),
      createdAt: games.createdAt,
      updatedAt: games.updatedAt,
    })
    .from(games)
    .leftJoin(resources, eq(games.id, resources.gameId))
    .groupBy(games.id)
    .orderBy(games.name);

  return (
    <AdminLayout>
      <GameList gameList={gameList} />
    </AdminLayout>
  );
}
