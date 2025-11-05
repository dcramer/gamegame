import { getGame } from "@/lib/actions/games";
import { getAllResourcesForGame } from "@/lib/actions/resources";
import { notFound } from "next/navigation";
import ResourceList from "../resource-list";

export const maxDuration = 300;

export default async function Page(props: { params: Promise<{ gameId: string }> }) {
  const params = await props.params;
  const game = await getGame(params.gameId);
  if (!game) {
    notFound();
  }

  const resourceList = await getAllResourcesForGame(game.id);

  return <ResourceList gameId={game.id} resourceList={resourceList} />;
}
