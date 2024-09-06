import Heading from "@/components/heading";
import { default as LayoutComponent } from "@/components/layout";
import { Button } from "@/components/ui/button";
import { getGame } from "@/lib/actions/games";
import { MessageCircle } from "lucide-react";
import Link from "next/link";
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
      <div className="flex justify-center items-center gap-4 mb-4">
        <Heading className="mb-0">{game.name}</Heading>
        <Button asChild variant="ghost">
          <Link href={`/ask/${game.id}`}>
            <MessageCircle className="h-4 w-4" />
          </Link>
        </Button>
      </div>
      {children}
    </LayoutComponent>
  );
}
