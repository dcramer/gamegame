'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Dices } from 'lucide-react';
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

export function GamesGrid({ games }: { games: Game[] }) {
  const [searchTerm, setSearchTerm] = useState('');
  const [imageErrors, setImageErrors] = useState<Set<string>>(new Set());

  const matchingGames = games.filter((game) =>
    game.name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="flex flex-col gap-6">
      <Input
        placeholder="Search games..."
        value={searchTerm}
        onChange={(e) => setSearchTerm(e.target.value)}
      />
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
                      setImageErrors((prev) => new Set(prev).add(game.id));
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
            {games.length === 0 ? 'No games yet' : 'No games found'}
          </h3>
          <p className="text-muted-foreground">
            {games.length === 0
              ? 'Check with your administrator to add games.'
              : 'No games found matching your search. Try a different search term.'}
          </p>
        </div>
      )}
    </div>
  );
}
