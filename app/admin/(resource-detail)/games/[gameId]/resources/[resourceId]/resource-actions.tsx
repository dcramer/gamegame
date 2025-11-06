"use client";

import { ActionButton } from "@/components/ui/action-button";
import { RefreshCw, Trash2, ExternalLink } from "lucide-react";
import { useRouter } from "next/navigation";
import { orpc } from "@/lib/procedures/client";
import { useFlashMessages } from "@/components/flashMessages";

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

  const handleReprocess = async () => {
    if (
      !confirm(
        `Reprocess "${resourceName}"?\n\nThis will re-extract the PDF, re-analyze images, and re-embed all content.`
      )
    ) {
      return;
    }

    const message = flash(`Reprocessing ${resourceName}...`, "info", {
      removeAfter: null,
    });

    try {
      // TODO: Add reprocess to API client
      const response = await fetch(`/api/resources/${resourceId}/reprocess`, {
        method: 'POST',
        credentials: 'same-origin',
      });

      if (!response.ok) {
        throw new Error('Failed to reprocess resource');
      }

      message.update(
        `${resourceName} queued for reprocessing`,
        "success",
        { removeAfter: 5000 }
      );
      router.refresh();
    } catch (error) {
      console.error("Reprocess error:", error);
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";
      message.update(`Failed to reprocess: ${errorMessage}`, "error", {
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
        <ActionButton
          icon={RefreshCw}
          title="Reprocess Resource"
          description="Re-extract PDF, re-analyze images, and re-embed content"
          onClick={handleReprocess}
        />
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
