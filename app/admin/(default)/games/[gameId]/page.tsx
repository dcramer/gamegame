import { serverClient } from "@/lib/procedures/client.server";
import { handleServerError } from "@/lib/errors";
import Form from "./form";

export const maxDuration = 300;

export default async function Page(props: { params: Promise<{ gameId: string }> }) {
  const params = await props.params;

  // Fetch game using oRPC server client (Server Component)
  try {
    const game = await serverClient.games.get({ idOrSlug: params.gameId });
    return <Form game={game} />;
  } catch (error) {
    handleServerError(error);
  }
}
