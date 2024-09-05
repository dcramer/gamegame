import Heading from "@/components/heading";
import Layout from "@/components/layout";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { getAllGames } from "@/lib/actions/games";
import Link from "next/link";

export default async function Page() {
  const gameList = await getAllGames();
  return (
    <Layout>
      <Heading>Games</Heading>
      {gameList.length === 0 ? (
        <div className="flex flex-1 flex-col gap-6 items-center justify-center rounded-lg border border-dashed shadow-sm p-6 bg-muted min-h-64">
          <div className="flex flex-col items-center gap-1 text-center">
            <h3 className="text-2xl font-bold tracking-tight">
              There are no games
            </h3>
            <p className="text-sm text-muted-foreground">
              Start by adding a game.
            </p>
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
              </TableRow>
            </TableHeader>
            <TableBody>
              {gameList.map((game) => {
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
      )}
    </Layout>
  );
}
