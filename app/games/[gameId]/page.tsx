import { Chat } from "@/components/chat";
import Layout from "@/components/layout";
import { getGame } from "@/lib/actions/games";
import { notFound } from "next/navigation";

export async function generateMetadata(
  props: {
    params: Promise<{ gameId: string }>;
  }
) {
  const params = await props.params;

  const {
    gameId
  } = params;

  const game = await getGame(gameId);
  if (!game) {
    return notFound();
  }

  return {
    title: `${game.name} | GameGame`,
  };
}

export default async function Page(
  props: {
    params: Promise<{ gameId: string }>;
  }
) {
  const params = await props.params;

  const {
    gameId
  } = params;

  const game = await getGame(gameId);
  if (!game) {
    return notFound();
  }

  return <Chat game={game} />;
}
