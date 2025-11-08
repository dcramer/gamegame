"use client";

import { ActionButton } from "@/components/ui/action-button";
import { RefreshCw, ExternalLink } from "lucide-react";
import { useRouter } from "next/navigation";
import { orpc } from "@/lib/procedures/client";
import { useFlashMessages } from "@/components/flashMessages";
import { useWorkflowFlash } from "@/components/workflowFlashMessage";

interface AttachmentActionsProps {
  attachmentId: string;
  attachmentUrl: string;
  attachmentType: string;
  gameId: string;
}

export default function AttachmentActions({
  attachmentId,
  attachmentUrl,
  attachmentType,
  gameId,
}: AttachmentActionsProps) {
  const router = useRouter();
  const { flash } = useFlashMessages();
  const workflowFlash = useWorkflowFlash();

  const handleReanalyze = async () => {
    if (
      !confirm(
        `Reanalyze this image?\n\nThis will re-run vision analysis to generate a new description and quality rating.`
      )
    ) {
      return;
    }

    try {
      const response = await orpc.attachments.reprocess({ id: attachmentId });

      if (response.runId) {
        // Use workflow flash to track reanalysis
        workflowFlash(
          response.runId,
          `Analyzing image...`,
          {
            displayName: `Image Analysis`,
            onComplete: () => {
              router.refresh();
            },
            onError: (error) => {
              console.error('Image analysis failed:', error);
              router.refresh();
            }
          }
        );
        router.refresh();
      } else {
        // Unexpected immediate completion
        flash(`Image analysis completed`, "success", { removeAfter: 5000 });
        router.refresh();
      }
    } catch (error) {
      console.error("Reanalyze error:", error);
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";
      flash(`Failed to analyze: ${errorMessage}`, "error", {
        removeAfter: 8000,
      });
    }
  };

  return (
    <div className="space-y-8">
      <div>
        <h3 className="text-sm font-semibold mb-3">Attachment</h3>
        <ActionButton
          icon={ExternalLink}
          title="View Full Size"
          description="Open the attachment in a new tab"
          onClick={() => window.open(attachmentUrl, "_blank")}
        />
      </div>

      {attachmentType === "image" && (
        <div>
          <h3 className="text-sm font-semibold mb-3">AI Analysis</h3>
          <ActionButton
            icon={RefreshCw}
            title="Reanalyze Image"
            description="Re-run vision analysis to update description and quality"
            onClick={handleReanalyze}
          />
        </div>
      )}
    </div>
  );
}
