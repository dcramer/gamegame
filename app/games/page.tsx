import Heading from '@/components/heading';
import Layout from '@/components/layout';
import { db } from '@/lib/db';
import { games, resources } from '@/lib/db/schema';
import { eq, sql } from 'drizzle-orm';
import { GamesGrid } from './games-grid';

interface Game {
  id: string;
  name: string;
  slug: string;
  year?: number | null;
  imageUrl: string | null;
  bggUrl: string | null;
  resourceCount?: number;
}

async function getGames(): Promise<Game[]> {
  const gamesList = await db
    .select({
      id: games.id,
      name: games.name,
      year: games.year,
      slug: games.slug,
      imageUrl: games.imageUrl,
      bggUrl: games.bggUrl,
      resourceCount: sql<number>`COUNT(DISTINCT ${resources.id})`.mapWith(Number),
    })
    .from(games)
    .leftJoin(resources, eq(games.id, resources.gameId))
    .groupBy(games.id)
    .orderBy(games.name);

  return gamesList;
}

export default async function GamesPage() {
  const games = await getGames();

  return (
    <Layout>
      <section className="text-center py-3 lg:py-12">
        <Heading className="text-2xl lg:text-5xl lg:mb-6 mb-2">
          What are you playing?
        </Heading>
        <p className="text-lg lg:text-xl mb-4 lg:mb-8 text-muted-foreground">
          Select your game to start getting answers about the rules.
        </p>
      </section>

      <GamesGrid games={games} />
    </Layout>
  );
}
