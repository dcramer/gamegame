import Heading from "@/components/heading";
import Layout from "@/components/layout";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { GAMES } from "@/constants";
import { getAllResourcesForGame, getGame } from "@/lib/actions/games";
import { notFound } from "next/navigation";

export default async function Page({ params }: { params: { gameId: string } }) {
  const game = await getGame(params.gameId);
  if (!game) {
    notFound();
  }

  const resourceList = await getAllResourcesForGame(game.id);

  return (
    <Layout>
      <Heading>{game.name}</Heading>
      {resourceList.length === 0 ? (
        <div className="flex flex-1 flex-col gap-6 items-center justify-center rounded-lg border border-dashed shadow-sm p-6 bg-muted min-h-64">
          <div className="flex flex-col items-center gap-1 text-center">
            <h3 className="text-2xl font-bold tracking-tight">
              There are no resources
            </h3>
            <p className="text-sm text-muted-foreground">
              Drag a PDF file of a rulebook here to add it to the game.
            </p>
          </div>
        </div>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Resource</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {resourceList.map((resource) => {
              return (
                <TableRow key={resource.id}>
                  <TableCell className="font-medium">{resource.name}</TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      )}
    </Layout>
  );
}
