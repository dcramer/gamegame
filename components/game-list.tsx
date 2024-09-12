"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import Image from "next/image";
import Link from "next/link";
import { Input } from "./ui/input";
import { useState } from "react";

export default function GameList({
  gameList,
}: {
  gameList: {
    id: string;
    name: string;
    imageUrl: string | null;
  }[];
}) {
  const [matchingGameList, setMatchingGameList] = useState(gameList);

  const handleSearch = (e: React.ChangeEvent<HTMLInputElement>) => {
    const searchTerm = e.target.value;
    const matchingGames = gameList.filter((game) =>
      game.name.toLowerCase().includes(searchTerm.toLowerCase())
    );
    setMatchingGameList(matchingGames);
  };

  return (
    <div className="flex flex-col gap-4">
      <Input placeholder="Search" onChange={handleSearch} />
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
        {matchingGameList.map((game) => (
          <Card
            key={game.id}
            className="relative rounded-none lg:rounded hover:ring-ring hover:ring-offset-2 ring-offset-background hover:ring-2"
          >
            <CardContent className="flex flex-col items-center">
              <div className="w-full aspect-[3/2] overflow-hidden relative">
                {game.imageUrl ? (
                  <Image
                    src={game.imageUrl}
                    alt={game.name}
                    fill
                    sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"
                    style={{
                      objectFit: "cover",
                      objectPosition: "top",
                    }}
                  />
                ) : null}
              </div>
            </CardContent>
            <CardHeader>
              <CardTitle className="text-center text-2xl">
                {game.name}
              </CardTitle>
            </CardHeader>
            <Link
              href={`/ask/${game.id}`}
              prefetch={false}
              className="inset-0 absolute"
            />
          </Card>
        ))}
      </div>
    </div>
  );
}
