import { useState } from 'react';
import { Link, useLoaderData } from 'react-router';
import type { Route } from './+types/games';
import Layout from '../components/Layout';
import Heading from '../components/Heading';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Input } from '../components/ui/input';
import { getDb, games } from '../../src/lib/db';

interface Game {
  id: string;
  name: string;
  slug: string;
  year?: number | null;
  imageUrl: string | null;
  bggUrl: string | null;
  resourceCount?: number;
}

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

      <div className="flex flex-col gap-4">
        <Input placeholder="Search" onChange={handleSearch} />
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
          {matchingGames.map((game) => (
            <Card
              key={game.id}
              className="relative rounded-none lg:rounded hover:ring-ring hover:ring-offset-2 ring-offset-background hover:ring-2"
            >
              <CardContent className="flex flex-col items-center">
                <div className="w-full aspect-[3/2] overflow-hidden relative bg-muted flex items-center justify-center">
                  {game.imageUrl && !imageErrors.has(game.id) ? (
                    <img
                      src={game.imageUrl}
                      alt={game.name}
                      className="w-full h-full object-cover object-top"
                      onError={() => {
                        setImageErrors(prev => new Set(prev).add(game.id));
                      }}
                    />
                  ) : (
                    <div className="text-4xl text-muted-foreground">🎲</div>
                  )}
                </div>
              </CardContent>
              <CardHeader>
                <CardTitle className="text-center text-2xl">
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
          <div className="text-center py-12">
            <p className="text-xl">
              {games.length === 0
                ? "No games yet. Check with your administrator to add games."
                : "No games found matching your search."
              }
            </p>
          </div>
        )}
      </div>
    </Layout>
  );
}
