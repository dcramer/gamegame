import { useState } from 'react';
import { Link, useLoaderData } from 'react-router';
import { Dices } from 'lucide-react';
import type { Route } from './+types/games';
import Layout from '../components/Layout';
import Heading from '../components/Heading';
import { Card, CardHeader, CardTitle } from '../components/ui/card';
import { EmptyState } from '../components/EmptyState';
import { Input } from '../components/ui/input';
import { getDb, games } from '../../src/lib/db';
import { createMeta, createGamesTitle } from '../lib/meta';

interface Game {
  id: string;
  name: string;
  slug: string;
  year?: number | null;
  imageUrl: string | null;
  bggUrl: string | null;
  resourceCount?: number;
}

export const meta = () => {
  return createMeta({
    title: createGamesTitle(),
    description: "Browse our collection of board games. Get instant answers to rules questions with AI-powered assistance.",
  });
};

export async function loader({ context }: Route.LoaderArgs) {
  const { cloudflare } = context;
  const db = getDb(cloudflare.env.DB);

  const gamesList = await db.select().from(games).all();

  return { games: gamesList };
}

export default function Games() {
  const { games } = useLoaderData<typeof loader>();
  const [matchingGames, setMatchingGames] = useState<Game[]>(games);
  const [imageErrors, setImageErrors] = useState<Set<string>>(new Set());

  const handleSearch = (e: React.ChangeEvent<HTMLInputElement>) => {
    const searchTerm = e.target.value;
    const matching = games.filter((game) =>
      game.name.toLowerCase().includes(searchTerm.toLowerCase())
    );
    setMatchingGames(matching);
  };

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

      <div className="flex flex-col gap-6">
        <Input placeholder="Search" onChange={handleSearch} />
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-8">
          {matchingGames.map((game) => (
            <Card
              key={game.id}
              className="relative rounded-lg overflow-hidden border-2 border-border hover:border-primary hover:scale-105 transition-all duration-200 hover:shadow-2xl hover:shadow-primary/20 group"
            >
              <div className="w-full aspect-[3/2] overflow-hidden relative bg-muted flex items-center justify-center">
                {game.imageUrl && !imageErrors.has(game.id) ? (
                  <>
                    <img
                      src={game.imageUrl}
                      alt={game.name}
                      className="w-full h-full object-cover object-top group-hover:scale-110 transition-transform duration-200"
                      onError={() => {
                        setImageErrors(prev => new Set(prev).add(game.id));
                      }}
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-200" />
                  </>
                ) : (
                  <Dices className="w-16 h-16 text-muted-foreground" />
                )}
              </div>
              <CardHeader className="py-4">
                <CardTitle className="text-center text-xl leading-tight">
                  {game.name}
                </CardTitle>
              </CardHeader>
              <Link
                to={`/games/${game.slug || game.id}`}
                className="inset-0 absolute"
              />
            </Card>
          ))}
        </div>

        {matchingGames.length === 0 && (
          <EmptyState
            title={games.length === 0 ? "No games yet" : "No games found"}
            description={
              games.length === 0
                ? "Check with your administrator to add games."
                : "No games found matching your search. Try a different search term."
            }
            icon={<Dices className="w-12 h-12" />}
          />
        )}
      </div>
    </Layout>
  );
}
