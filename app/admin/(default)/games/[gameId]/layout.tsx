import { Suspense } from "react";
import { serverClient } from "@/lib/procedures/client.server";
import { PageHeader } from "@/components/page-header";
import { Breadcrumbs } from "@/components/breadcrumbs";
import { Button } from "@/components/ui/button";
import { MessageSquare } from "lucide-react";
import Link from "next/link";
import GameTabs from "./game-tabs";
import GameActions from "./game-actions";
import { handleServerError } from "@/lib/errors";
import type {
  AttachmentListResponse,
  GameResponse,
  ResourceListResponse,
} from "@/lib/api/schemas";

type GameData = GameResponse & { resourceCount: number };
type ResourceList = ResourceListResponse;
type AttachmentList = AttachmentListResponse;

/**
 * Loading skeleton for game header
 */
function GameHeaderLoading() {
  return (
    <>
      <Breadcrumbs
        items={[
          { label: "Games", href: "/admin" },
          { label: "Loading..." },
        ]}
      />
      <PageHeader title="Loading game..." />
      <div className="animate-pulse h-12 bg-gray-200 dark:bg-gray-800 rounded mb-4" />
    </>
  );
}

/**
 * Loading skeleton for game actions sidebar
 */
function GameActionsLoading() {
  return (
    <div className="lg:w-[380px]">
      <div className="animate-pulse space-y-4">
        <div className="h-32 bg-gray-200 dark:bg-gray-800 rounded" />
        <div className="h-24 bg-gray-200 dark:bg-gray-800 rounded" />
      </div>
    </div>
  );
}

/**
 * Fetches game data and renders header
 */
async function GameHeader({ gameId }: { gameId: string }) {
  let game: GameData;
  let resourceList: ResourceList;
  try {
    game = await serverClient.games.get({ idOrSlug: gameId }) as GameData;
    resourceList = await serverClient.resources.listForGame({ gameId: game.id }) as ResourceList;
  } catch (error) {
    return handleServerError(error);
  }

  return (
    <>
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
    </>
  );
}

/**
 * Fetches game tabs data and renders tabs
 */
async function GameTabsWithData({ gameId, children }: { gameId: string; children: React.ReactNode }) {
  let game: GameData;
  let resourceList: ResourceList;
  let attachmentList: AttachmentList;
  try {
    game = await serverClient.games.get({ idOrSlug: gameId }) as GameData;
    [resourceList, attachmentList] = await Promise.all([
      serverClient.resources.listForGame({ gameId: game.id }) as Promise<ResourceList>,
      serverClient.attachments.listForGame({ gameId: game.id }) as Promise<AttachmentList>,
    ]);
  } catch (error) {
    return handleServerError(error);
  }

  return (
    <GameTabs
      gameId={game.id}
      resourceCount={resourceList.length}
      attachmentCount={attachmentList.length}
    >
      {children}
    </GameTabs>
  );
}

/**
 * Fetches game actions data and renders sidebar
 */
async function GameActionsWithData({ gameId }: { gameId: string }) {
  let game: GameData;
  let resourceList: ResourceList;
  try {
    game = await serverClient.games.get({ idOrSlug: gameId }) as GameData;
    resourceList = await serverClient.resources.listForGame({ gameId: game.id }) as ResourceList;
  } catch (error) {
    return handleServerError(error);
  }

  return (
    <div className="lg:w-[380px]">
      <GameActions
        gameId={game.id}
        gameName={game.name}
        resourceIds={resourceList.map(
          (resource: ResourceList[number]) => resource.id
        )}
      />
    </div>
  );
}

/**
 * Game layout with streaming data fetching
 * Uses Suspense boundaries to prevent blocking child rendering
 */
export default async function Layout(props: {
  params: Promise<{ gameId: string }>;
  children: React.ReactNode;
}) {
  const params = await props.params;
  const { children } = props;

  return (
    <>
      <Suspense fallback={<GameHeaderLoading />}>
        <GameHeader gameId={params.gameId} />
      </Suspense>

      <Suspense fallback={<div className="animate-pulse h-12 bg-gray-200 dark:bg-gray-800 rounded mb-4" />}>
        <GameTabsWithData gameId={params.gameId}>
          <div className="flex flex-col lg:flex-row gap-8">
            {/* Left column - Content */}
            <div className="flex-1">
              {children}
            </div>

            {/* Right column - Actions sidebar */}
            <Suspense fallback={<GameActionsLoading />}>
              <GameActionsWithData gameId={params.gameId} />
            </Suspense>
          </div>
        </GameTabsWithData>
      </Suspense>
    </>
  );
}
