"use client";

import { ActionButton } from "@/components/ui/action-button";
import { RefreshCw, Trash2, ExternalLink } from "lucide-react";
import { useRouter } from "next/navigation";
import { orpc } from "@/lib/procedures/client";
import { useFlashMessages } from "@/components/flashMessages";
import { useWorkflowFlash } from "@/components/workflowFlashMessage";
import {
  REPROCESS_STAGE_DEFINITIONS,
  REPROCESS_STAGE_ORDER,
  getStageDisplayName,
  getStageMessages,
  type ReprocessStage,
} from "@/lib/reprocess/stages";

interface ResourceActionsProps {
  resourceId: string;
  resourceName: string;
  resourceUrl: string;
  gameId: string;
}

export default function ResourceActions({
  resourceId,
  resourceName,
  resourceUrl,
  gameId,
}: ResourceActionsProps) {
  const router = useRouter();
  const { flash } = useFlashMessages();
  const workflowFlash = useWorkflowFlash();

  const handleReprocess = async (stage: ReprocessStage = 'ingest') => {
    const stageDefinition = REPROCESS_STAGE_DEFINITIONS[stage];
    const messages = getStageMessages(stage, resourceName);
    const displayName = getStageDisplayName(stage, resourceName);
    const optimisticMessage = flash(messages.starting, "info", {
      removeAfter: null,
    });

    try {
      const response = await orpc.resources.reprocess({
        id: resourceId,
        fromStage: stage === 'ingest' ? undefined : stage,
        onlyStage: stageDefinition.onlyStage,
      });

      if (response.runId) {
        workflowFlash(
          response.runId,
          {
            pending: messages.pending,
            success: messages.success,
            failure: (error) => messages.failure(error),
            cancelled: messages.cancelled,
          },
          {
            displayName,
            existingMessage: optimisticMessage,
            onComplete: () => {
              router.refresh();
            },
            onError: (error) => {
              console.error('Reprocessing failed:', error);
              router.refresh();
            },
          }
        );
        router.refresh();
      } else {
        optimisticMessage.update(messages.success, "success", {
          removeAfter: 5000,
        });
        router.refresh();
      }
    } catch (error) {
      console.error("Reprocess error:", error);
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";
      optimisticMessage.update(messages.failure(errorMessage), "error", {
        removeAfter: 8000,
      });
    }
  };

  const handleDelete = async () => {
    if (
      !confirm(
        `Delete "${resourceName}"?\n\nThis will permanently delete:\n- The resource\n- All fragments and embeddings\n- All extracted attachments\n\nThis action cannot be undone.`
      )
    ) {
      return;
    }

    const message = flash(`Deleting ${resourceName}...`, "info", {
      removeAfter: null,
    });

    try {
      await orpc.resources.deleteResource({ id: resourceId });
      message.update(`Deleted ${resourceName}`, "success", { removeAfter: 3000 });
      // Redirect to game resources page
      router.push(`/admin/games/${gameId}/resources`);
    } catch (error) {
      console.error("Delete resource error:", error);
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";
      message.update(`Failed to delete resource: ${errorMessage}`, "error", {
        removeAfter: 8000,
      });
    }
  };

  return (
    <div className="space-y-8">
      <div>
        <h3 className="text-sm font-semibold mb-3">Resource</h3>
        <ActionButton
          icon={ExternalLink}
          title="View Source File"
          description="Open the original PDF file in a new tab"
          onClick={() => window.open(resourceUrl, "_blank")}
        />
      </div>

      <div>
        <h3 className="text-sm font-semibold mb-3">Reprocessing</h3>
        <div className="space-y-2">
          {REPROCESS_STAGE_ORDER.map((stage) => {
            const definition = REPROCESS_STAGE_DEFINITIONS[stage];
            return (
              <ActionButton
                key={stage}
                icon={RefreshCw}
                title={definition.actionTitle}
                description={definition.actionDescription}
                onClick={() => handleReprocess(stage)}
              />
            );
          })}
        </div>
      </div>

      <div>
        <h3 className="text-sm font-semibold mb-3">Danger Zone</h3>
        <ActionButton
          icon={Trash2}
          title="Delete Resource"
          description="Permanently delete this resource and all associated data"
          onClick={handleDelete}
          variant="danger"
        />
      </div>
    </div>
  );
}
