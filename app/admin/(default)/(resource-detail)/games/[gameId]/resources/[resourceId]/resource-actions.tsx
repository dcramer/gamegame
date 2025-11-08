"use client";

import { ActionButton } from "@/components/ui/action-button";
import { RefreshCw, Trash2, ExternalLink } from "lucide-react";
import { useRouter } from "next/navigation";
import { orpc } from "@/lib/procedures/client";
import { useFlashMessages } from "@/components/flashMessages";
import { useWorkflowFlash } from "@/components/workflowFlashMessage";

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

  const handleReprocess = async (fromStage: 'ingest' | 'vision' | 'cleanup' | 'metadata' | 'embed' = 'ingest') => {
    // Map 'fromStage' parameter to user-friendly titles
    const jobTitles = {
      ingest: 'Full Reprocess',
      vision: 'Improve Image Descriptions',
      cleanup: 'Clean Up Markdown',
      metadata: 'Regenerate Metadata',
      embed: 'Regenerate Embeddings',
    };
    const title = jobTitles[fromStage];

    try {
      const response = await orpc.resources.reprocess({
        id: resourceId,
        fromStage: fromStage === 'ingest' ? undefined : fromStage
      });

      if (response.runId) {
        // Use workflow flash to track reprocessing
        workflowFlash(
          response.runId,
          `${title}: ${resourceName}...`,
          {
            displayName: `${title}: ${resourceName}`,
            onComplete: () => {
              router.refresh();
            },
            onError: (error) => {
              console.error('Reprocessing failed:', error);
              router.refresh();
            }
          }
        );
        router.refresh();
      } else {
        // Unexpected immediate completion
        flash(`${resourceName} reprocessed successfully`, "success", {
          removeAfter: 5000,
        });
        router.refresh();
      }
    } catch (error) {
      console.error("Reprocess error:", error);
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";
      flash(`Failed to reprocess: ${errorMessage}`, "error", {
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
          <ActionButton
            icon={RefreshCw}
            title="Full Reprocess"
            description="Complete pipeline from scratch"
            onClick={() => handleReprocess('ingest')}
          />
          <ActionButton
            icon={RefreshCw}
            title="Improve Image Descriptions"
            description="Re-analyze image content"
            onClick={() => handleReprocess('vision')}
          />
          <ActionButton
            icon={RefreshCw}
            title="Clean Up Markdown"
            description="Fix formatting issues"
            onClick={() => handleReprocess('cleanup')}
          />
          <ActionButton
            icon={RefreshCw}
            title="Regenerate Metadata"
            description="Update document title and description"
            onClick={() => handleReprocess('metadata')}
          />
          <ActionButton
            icon={RefreshCw}
            title="Regenerate Embeddings"
            description="Update search index"
            onClick={() => handleReprocess('embed')}
          />
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
