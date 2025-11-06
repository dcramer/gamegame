"use client";

import { ActionButton } from "@/components/ui/action-button";
import { RefreshCw, ExternalLink } from "lucide-react";
import { useRouter } from "next/navigation";
import { reanalyzeAttachment } from "@/lib/actions/attachments";
import { useFlashMessages } from "@/components/flashMessages";

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

  const handleReanalyze = async () => {
    if (
      !confirm(
        `Reanalyze this image?\n\nThis will re-run vision analysis to generate a new description and quality rating.`
      )
    ) {
      return;
    }

    const message = flash(`Analyzing image...`, "info", {
      removeAfter: null,
    });

    try {
      await reanalyzeAttachment(attachmentId, gameId);
      message.update(`Image analysis started`, "success", { removeAfter: 5000 });
      // Refresh after a short delay to let the workflow start
      setTimeout(() => router.refresh(), 2000);
    } catch (error) {
      console.error("Reanalyze error:", error);
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";
      message.update(`Failed to analyze: ${errorMessage}`, "error", {
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
