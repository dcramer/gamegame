import { getAllResourcesForGame, getGame } from "@/lib/actions/games";
import { notFound } from "next/navigation";
import ResourceList from "./resource-list";
import Form from "./form";

export default async function Page({ params }: { params: { gameId: string } }) {
  const game = await getGame(params.gameId);
  if (!game) {
    notFound();
  }

  const resourceList = await getAllResourcesForGame(game.id);

  return (
    <div className="flex flex-col gap-12">
      <Form game={game} />
      <ResourceList gameId={game.id} resourceList={resourceList} />
    </div>
  );
}
