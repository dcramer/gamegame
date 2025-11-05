import { getGame } from "@/lib/actions/games";
import { getAllResourcesForGame } from "@/lib/actions/resources";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { MessageSquare } from "lucide-react";
import Link from "next/link";
import AdminLayout from "@/components/admin-layout";
import GameTabs from "./game-tabs";
import GameActions from "./game-actions";

export default async function Layout(props: {
  params: Promise<{ gameId: string }>;
  children: React.ReactNode;
}) {
  const params = await props.params;
  const { children } = props;

  const game = await getGame(params.gameId);
  if (!game) {
    notFound();
  }

  const resourceList = await getAllResourcesForGame(game.id);

  return (
    <AdminLayout>
      <PageHeader
        breadcrumbs={[
          { label: "Admin", href: "/admin" },
          { label: "Games", href: "/admin" },
          { label: game.name },
        ]}
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

      <div className="flex flex-col lg:flex-row gap-8">
        {/* Left column - Content with tabs */}
        <div className="flex-1">
          <GameTabs gameId={game.id}>
            {children}
          </GameTabs>
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
    </AdminLayout>
  );
}
