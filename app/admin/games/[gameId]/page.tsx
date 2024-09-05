import Heading from "@/components/heading";
import Layout from "@/components/layout";
import { getAllResourcesForGame, getGame } from "@/lib/actions/games";
import { notFound } from "next/navigation";
import ResourceList from "./resource-list";

export default async function Page({ params }: { params: { gameId: string } }) {
  const game = await getGame(params.gameId);
  if (!game) {
    notFound();
  }

  const resourceList = await getAllResourcesForGame(game.id);

  return <ResourceList gameId={game.id} resourceList={resourceList} />;
}
