"use client";

import { ActionButton } from "@/components/ui/action-button";
import { RefreshCw, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { orpc } from "@/lib/procedures/client";
import { useFlashMessages } from "@/components/flashMessages";
import { useWorkflowFlash } from "@/components/workflowFlashMessage";

interface GameActionsProps {
  gameId: string;
  gameName: string;
  resourceIds: string[];
}

export default function GameActions({
  gameId,
  gameName,
  resourceIds,
}: GameActionsProps) {
  const router = useRouter();
  const { flash } = useFlashMessages();
  const workflowFlash = useWorkflowFlash();

  const handleReprocessAll = async () => {
    if (
      !confirm(
        `Reprocess all ${resourceIds.length} resources for "${gameName}"?\n\nThis will re-extract PDFs, re-analyze images, and re-embed all content.`
      )
    ) {
      return;
    }

    const progressMessage = flash(
      `Starting full pipeline re-run for ${resourceIds.length} ${resourceIds.length === 1 ? "resource" : "resources"}...`,
      "info",
      { removeAfter: null }
    );

    try {
      let successCount = 0;
      let failCount = 0;

      for (const resourceId of resourceIds) {
        try {
          const result = await orpc.resources.reprocess({ id: resourceId });
          successCount++;

          if (result.runId) {
            workflowFlash(
              result.runId,
              {
                pending: `Full pipeline running for ${resourceId}...`,
                success: `Full pipeline completed for ${resourceId}`,
                failure: (error) => `Full pipeline failed for ${resourceId}: ${error}`,
                cancelled: `Full pipeline cancelled for ${resourceId}`,
              },
              {
                displayName: `Full Pipeline: ${resourceId}`,
                onComplete: () => router.refresh(),
                onError: () => router.refresh(),
              }
            );
          }
        } catch (error) {
          console.error(`Failed to reprocess resource ${resourceId}:`, error);
          failCount++;
        }
      }

      if (failCount === 0) {
        progressMessage.update(
          `Reprocessing ${successCount} ${successCount === 1 ? "resource" : "resources"}`,
          "success",
          { removeAfter: 5000 }
        );
      } else {
        progressMessage.update(
          `Started ${successCount} jobs, ${failCount} failed`,
          "error",
          { removeAfter: null }
        );
      }

      // Refresh to show updated status
      router.refresh();
    } catch (error) {
      console.error("Reprocess all error:", error);
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";
      progressMessage.update(`Failed to reprocess resources: ${errorMessage}`, "error", {
        removeAfter: null,
      });
    }
  };

  const handleDeleteGame = async () => {
    if (
      !confirm(
        `Delete "${gameName}"?\n\nThis will permanently delete:\n- The game\n- All resources\n- All fragments and embeddings\n- All associated files\n\nThis action cannot be undone.`
      )
    ) {
      return;
    }

    const message = flash(`Deleting ${gameName}...`, "info", {
      removeAfter: null,
    });

    try {
      await orpc.games.deleteGame({ id: gameId });
      message.update(`Deleted ${gameName}`, "success", { removeAfter: 3000 });
      // Redirect to admin games page
      router.push("/admin");
    } catch (error) {
      console.error("Delete game error:", error);
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";
      message.update(`Failed to delete game: ${errorMessage}`, "error", {
        removeAfter: 8000,
      });
    }
  };

  return (
    <div className="space-y-8">
      {resourceIds.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold mb-3">Reprocessing</h3>
          <ActionButton
            icon={RefreshCw}
            title="Reprocess All Resources"
            description={`Re-extract all PDFs, re-analyze images, and re-embed content for all ${resourceIds.length} ${resourceIds.length === 1 ? "resource" : "resources"}`}
            onClick={handleReprocessAll}
          />
        </div>
      )}


      <div>
        <h3 className="text-sm font-semibold mb-3">Danger Zone</h3>
        <ActionButton
          icon={Trash2}
          title="Delete Game"
          description="Permanently delete this game and all associated resources"
          onClick={handleDeleteGame}
          variant="danger"
        />
      </div>
    </div>
  );
}
