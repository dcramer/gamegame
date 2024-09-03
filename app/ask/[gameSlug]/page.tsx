import { Chat } from "@/components/chat";
import { GAMES } from "@/constants";
import { notFound } from "next/navigation";

export default function Page({
  params: { gameSlug },
}: {
  params: { gameSlug: string };
}) {
  const game = GAMES.find((game) => game.slug === gameSlug);
  if (!game) {
    return notFound();
  }

  return <Chat game={game} />;
}
