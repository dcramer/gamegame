import { serverClient } from "@/lib/procedures/client.server";
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

  // Fetch game and resources using oRPC server client (Server Component)
  let game, resourceList;
  try {
    game = await serverClient.games.get({ idOrSlug: params.gameId });
    resourceList = await serverClient.resources.listForGame({ gameId: game.id });
  } catch (error) {
    notFound();
  }

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
