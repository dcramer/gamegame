import { Chat } from "@/components/chat";
import Layout from "@/components/layout";
import { getGame } from "@/lib/actions/games";
import { notFound } from "next/navigation";

export async function generateMetadata({
  params: { gameId },
}: {
  params: { gameId: string };
}) {
  const game = await getGame(gameId);
  if (!game) {
    return notFound();
  }

  return {
    title: `${game.name} | GameGame`,
  };
}

export default async function Page({
  params: { gameId },
}: {
  params: { gameId: string };
}) {
  const game = await getGame(gameId);
  if (!game) {
    return notFound();
  }

  return <Chat game={game} />;
}
