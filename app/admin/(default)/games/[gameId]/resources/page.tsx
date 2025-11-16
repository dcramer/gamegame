import { serverClient } from "@/lib/procedures/client.server";
import { handleServerError } from "@/lib/errors";
import ResourceList from "../resource-list";

export const maxDuration = 300;

export default async function Page(props: { params: Promise<{ gameId: string }> }) {
  const params = await props.params;

  // Fetch game and resources using oRPC server client (Server Component)
  let game, resourceList;
  try {
    game = await serverClient.games.get({ idOrSlug: params.gameId });
    resourceList = await serverClient.resources.listForGame({ gameId: game.id });
  } catch (error) {
    handleServerError(error);
  }

  return <ResourceList gameId={game.id} resourceList={resourceList} />;
}
