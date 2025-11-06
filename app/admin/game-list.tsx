"use client";

import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import Link from "next/link";
import Image from "next/image";
import { orpc } from "@/lib/procedures/client";
import { useState } from "react";

export default function GameList({
  gameList,
}: {
  gameList: {
    id: string;
    name: string;
    imageUrl: string | null;
    bggUrl: string | null;
    hasResources: boolean;
  }[];
}) {
  const [activeGameList, setGameList] = useState(gameList);

  return activeGameList.length === 0 ? (
    <div className="flex flex-1 flex-col gap-6 items-center justify-center rounded-lg border border-dashed shadow-sm p-6 bg-muted min-h-64">
      <div className="flex flex-col items-center gap-1 text-center">
        <h3 className="text-2xl font-bold tracking-tight">
          There are no games
        </h3>
        <p className="text-sm text-muted-foreground">Start by adding a game.</p>
      </div>
      <Button asChild>
        <Link href="/admin/add-game">Add Game</Link>
      </Button>
    </div>
  ) : (
    <div className="flex flex-col gap-4">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-[80px]">Image</TableHead>
            <TableHead>Name</TableHead>
            <TableHead className="w-[200px] text-center">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {activeGameList.map((game) => {
            return (
              <TableRow key={game.id}>
                <TableCell>
                  <Link
                    href={`/admin/games/${game.id}`}
                    prefetch={false}
                  >
                    {game.imageUrl ? (
                      <div className="w-16 h-16 relative rounded overflow-hidden bg-muted">
                        <Image
                          src={game.imageUrl}
                          alt={game.name}
                          fill
                          sizes="64px"
                          style={{
                            objectFit: "cover",
                          }}
                        />
                      </div>
                    ) : (
                      <div className="w-16 h-16 rounded bg-muted flex items-center justify-center text-xs text-muted-foreground">
                        No image
                      </div>
                    )}
                  </Link>
                </TableCell>
                <TableCell className="font-medium relative">
                  <Link
                    href={`/admin/games/${game.id}`}
                    prefetch={false}
                    className="w-full block"
                  >
                    {game.name}
                  </Link>
                  {!!game.bggUrl && (
                    <div className="text-xs text-muted-foreground">
                      <Link href={game.bggUrl} className="hover:underline">
                        {game.bggUrl}
                      </Link>
                    </div>
                  )}
                  {!game.hasResources ? (
                    <div className="text-destructive">No Resources</div>
                  ) : null}
                </TableCell>
                <TableCell className="text-center">
                  <Button
                    size="sm"
                    variant="destructive-outline"
                    onClick={async (e) => {
                      e.stopPropagation();

                      try {
                        await orpc.games.deleteGame({ id: game.id });
                        setGameList(
                          activeGameList.filter((g) => g.id !== game.id)
                        );
                      } catch (error) {
                        console.error('Failed to delete game:', error);
                        alert('Failed to delete game');
                      }
                    }}
                  >
                    Delete
                  </Button>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
      <div className="self-end">
        <Button asChild size="sm">
          <Link href="/admin/add-game">Add Game</Link>
        </Button>
      </div>
    </div>
  );
}
