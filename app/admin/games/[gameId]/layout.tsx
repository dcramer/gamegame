import { db } from "@/lib/db";
import { games, resources } from "@/lib/db/schema";
import { eq, or } from "drizzle-orm";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/page-header";
import { Breadcrumbs } from "@/components/breadcrumbs";
import { Button } from "@/components/ui/button";
import { MessageSquare } from "lucide-react";
import Link from "next/link";
import AdminBaseLayout from "@/components/admin-base-layout";
import GameTabs from "./game-tabs";
import GameActions from "./game-actions";

export default async function Layout(props: {
  params: Promise<{ gameId: string }>;
  children: React.ReactNode;
}) {
  const params = await props.params;
  const { children } = props;

  // Fetch game directly from database (Server Component)
  const [game] = await db
    .select({
      id: games.id,
      name: games.name,
      year: games.year,
      slug: games.slug,
      imageUrl: games.imageUrl,
      bggId: games.bggId,
      bggUrl: games.bggUrl,
      createdAt: games.createdAt,
      updatedAt: games.updatedAt,
    })
    .from(games)
    .where(or(eq(games.slug, params.gameId), eq(games.id, params.gameId)))
    .limit(1);

  if (!game) {
    notFound();
  }

  // Fetch resources for this game
  const resourceList = await db
    .select({
      id: resources.id,
    })
    .from(resources)
    .where(eq(resources.gameId, game.id));

  return (
    <AdminBaseLayout>
      <Breadcrumbs
        items={[
          { label: "Games", href: "/admin" },
          { label: game.name },
        ]}
      />

      <PageHeader
        title={
          <div className="flex items-center gap-3">
            <span>{game.name}</span>
            <Button
              variant="outline"
              size="sm"
              asChild
              title="Open chat"
              className="h-8 w-8 p-0"
            >
              <Link href={`/games/${game.slug}`}>
                <MessageSquare className="h-4 w-4" />
              </Link>
            </Button>
          </div>
        }
        stats={
          resourceList.length > 0
            ? `${resourceList.length} ${resourceList.length === 1 ? "resource" : "resources"}`
            : undefined
        }
      />

      <GameTabs gameId={game.id}>
        <div className="flex flex-col lg:flex-row gap-8">
          {/* Left column - Content */}
          <div className="flex-1">
            {children}
          </div>

          {/* Right column - Actions sidebar */}
          <div className="lg:w-[380px]">
            <GameActions
              gameId={game.id}
              gameName={game.name}
              bggId={game.bggId}
              resourceIds={resourceList.map((r) => r.id)}
            />
          </div>
        </div>
      </GameTabs>
    </AdminBaseLayout>
  );
}
