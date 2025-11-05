import { getGame } from "@/lib/actions/games";
import { notFound } from "next/navigation";
import Form from "./form";

export const maxDuration = 300;

export default async function Page(props: { params: Promise<{ gameId: string }> }) {
  const params = await props.params;
  const game = await getGame(params.gameId);
  if (!game) {
    notFound();
  }

  return <Form game={game} />;
}
