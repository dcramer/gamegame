'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { Dices } from 'lucide-react';
import Heading from '@/components/heading';
import Layout from '@/components/layout';
import { Card, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';

interface Game {
  id: string;
  name: string;
  slug: string;
  year?: number | null;
  imageUrl: string | null;
  bggUrl: string | null;
  resourceCount?: number;
}

export default function GamesPage() {
  const [games, setGames] = useState<Game[]>([]);
  const [matchingGames, setMatchingGames] = useState<Game[]>([]);
  const [imageErrors, setImageErrors] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/games')
      .then((res) => res.json())
      .then((data) => {
        setGames(data);
        setMatchingGames(data);
        setLoading(false);
      })
      .catch((err) => {
        console.error('Failed to fetch games:', err);
        setLoading(false);
      });
  }, []);

  const handleSearch = (e: React.ChangeEvent<HTMLInputElement>) => {
    const searchTerm = e.target.value;
    const matching = games.filter((game) =>
      game.name.toLowerCase().includes(searchTerm.toLowerCase())
    );
    setMatchingGames(matching);
  };

  if (loading) {
    return (
      <Layout>
        <section className="text-center py-3 lg:py-12">
          <Heading className="text-2xl lg:text-5xl lg:mb-6 mb-2">
            What are you playing?
          </Heading>
        </section>
        <div className="flex justify-center items-center py-12">
          <Dices className="w-12 h-12 text-muted-foreground animate-pulse" />
        </div>
      </Layout>
    );
  }

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
        <Input placeholder="Search games..." onChange={handleSearch} />
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
                href={`/games/${game.slug || game.id}`}
                className="inset-0 absolute"
              />
            </Card>
          ))}
        </div>

        {matchingGames.length === 0 && (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <Dices className="w-12 h-12 text-muted-foreground mb-4" />
            <h3 className="text-xl font-semibold mb-2">
              {games.length === 0 ? "No games yet" : "No games found"}
            </h3>
            <p className="text-muted-foreground">
              {games.length === 0
                ? "Check with your administrator to add games."
                : "No games found matching your search. Try a different search term."}
            </p>
          </div>
        )}
      </div>
    </Layout>
  );
}
