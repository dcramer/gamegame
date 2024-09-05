import Heading from "@/components/heading";
import { default as LayoutComponent } from "@/components/layout";
import { getGame } from "@/lib/actions/games";
import { notFound } from "next/navigation";

export default async function Layout({
  params,
  children,
}: {
  params: { gameId: string };
  children: React.ReactNode;
}) {
  const game = await getGame(params.gameId);
  if (!game) {
    notFound();
  }

  return (
    <LayoutComponent>
      <Heading>{game.name}</Heading>
      {children}
    </LayoutComponent>
  );
}
