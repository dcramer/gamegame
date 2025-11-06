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

  // Resource detail pages have their own layout - just pass through wrapped in AdminLayout
  // Check if this is a resource detail page by looking at the params
  // Note: We can't use usePathname in server components, so we rely on the fact that
  // resource detail pages have their own layout.tsx that provides the full structure

  return (
    <AdminLayout>
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
    </AdminLayout>
  );
}
