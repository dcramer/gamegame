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
import { deleteGame } from "@/lib/actions/games";
import { useEffect, useState } from "react";

export default function GameList({
  gameList,
}: {
  gameList: {
    id: string;
    name: string;
    imageUrl: string | null;
    hasResources: boolean | unknown; // TODO: Fix this
  }[];
}) {
  const [activeGameList, setGameList] = useState(gameList);

  useEffect(() => {
    setGameList(gameList);
  }, [gameList]);

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
            <TableHead>Name</TableHead>
            <TableHead className="w-[200px] text-center">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {activeGameList.map((game) => {
            return (
              <TableRow key={game.id}>
                <TableCell className="font-medium relative">
                  <Link
                    href={`/admin/games/${game.id}`}
                    prefetch={false}
                    className="w-full block"
                  >
                    {game.name}
                  </Link>
                  {!game.hasResources ? (
                    <div className="text-red-400">No Resources</div>
                  ) : null}
                </TableCell>
                <TableCell className="text-center">
                  <Button
                    size="sm"
                    variant="destructive"
                    onClick={async (e) => {
                      e.stopPropagation();

                      await deleteGame(game.id);
                      setGameList(
                        activeGameList.filter((g) => g.id !== game.id)
                      );
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
        <Button asChild size="sm" variant="secondary">
          <Link href="/admin/add-game">Add Game</Link>
        </Button>
      </div>
    </div>
  );
}
