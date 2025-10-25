import { useState } from 'react';
import { useLoaderData } from 'react-router';
import type { Route } from './+types/games.$gameId';
import ErrorState from '../components/ErrorState';
import { Chat } from '../components/Chat';
import { getDb, games, resources } from '../../src/lib/db';
import { eq } from 'drizzle-orm';
import { createMeta, createGameTitle } from '../lib/meta';

export const meta = ({ data }: Route.MetaArgs) => {
  if (!data?.game) {
    return createMeta({
      title: 'Game Not Found | GameGame',
    });
  }

  return createMeta({
    title: createGameTitle(data.game.name),
    description: `Get instant answers about ${data.game.name} rules. Ask questions and get AI-powered responses based on the official rulebook.`,
  });
};

export async function loader({ params, context }: Route.LoaderArgs) {
  const { gameId } = params;
  const { cloudflare } = context;
  const db = getDb(cloudflare.env.DB);

  const game = await db
    .select({
      id: games.id,
      name: games.name,
      slug: games.slug,
      year: games.year,
      imageUrl: games.imageUrl,
      bggUrl: games.bggUrl,
      resourceCount: db.$count(resources, eq(resources.gameId, games.id)),
    })
    .from(games)
    .where(eq(games.slug, gameId))
    .get();

  if (!game) {
    throw new Response('Game not found', { status: 404 });
  }

  return { game };
}

export function ErrorBoundary({ error }: { error: Error }) {
  if (error instanceof Response) {
    if (error.status === 404) {
      return (
        <ErrorState
          title="Game not found"
          message="The game you're looking for doesn't exist or has been removed."
        />
      );
    }
  }

  return (
    <ErrorState
      title="Something went wrong"
      message="We couldn't load this game right now. Please try again later."
    />
  );
}

export default function GameDetail() {
  const { game } = useLoaderData<typeof loader>();
  const [imageError, setImageError] = useState(false);

  return <Chat game={game} imageError={imageError} setImageError={setImageError} />;
}
