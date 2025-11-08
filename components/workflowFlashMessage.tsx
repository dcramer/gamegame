"use client";

import { useEffect, useRef } from "react";
import { useFlashMessages } from "./flashMessages";
import type { FlashMessage } from "./flashMessages";

const POLL_INTERVAL = 3000; // 3 seconds
const AUTO_DISMISS_DELAY = 300000; // 5 minutes for workflow completions
const STORAGE_KEY = "workflow_status";

type WorkflowStatus = "pending" | "running" | "completed" | "failed" | "paused" | "cancelled";

interface WorkflowStatusData {
  runId: string;
  status: WorkflowStatus;
  workflowName: string;
  error?: string;
  createdAt: string;
  startedAt?: string;
  completedAt?: string;
}

interface WorkflowFlashOptions {
  /**
   * Callback fired when workflow completes successfully
   */
  onComplete?: () => void;

  /**
   * Callback fired when workflow fails
   */
  onError?: (error: string) => void;

  /**
   * Human-readable workflow name for display
   */
  displayName?: string;
}

interface StoredWorkflowData {
  runId: string;
  workflowName: string;
  displayName?: string;
  createdAt: string;
}

/**
 * Get stored workflow IDs from localStorage
 */
function getStoredWorkflows(): Record<string, StoredWorkflowData> {
  if (typeof window === "undefined") return {};

  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored ? JSON.parse(stored) : {};
  } catch (error) {
    console.error("Failed to parse workflow storage:", error);
    return {};
  }
}

/**
 * Store workflow ID in localStorage
 */
function storeWorkflow(runId: string, data: StoredWorkflowData): void {
  if (typeof window === "undefined") return;

  try {
    const workflows = getStoredWorkflows();
    workflows[runId] = data;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(workflows));
  } catch (error) {
    console.error("Failed to store workflow:", error);
  }
}

/**
 * Remove workflow ID from localStorage
 */
function removeWorkflow(runId: string): void {
  if (typeof window === "undefined") return;

  try {
    const workflows = getStoredWorkflows();
    delete workflows[runId];
    localStorage.setItem(STORAGE_KEY, JSON.stringify(workflows));
  } catch (error) {
    console.error("Failed to remove workflow:", error);
  }
}

/**
 * Fetch workflow status from API
 */
async function fetchWorkflowStatus(runId: string): Promise<WorkflowStatusData | null> {
  try {
    const response = await fetch(`/api/admin/workflows/${runId}`);

    if (!response.ok) {
      if (response.status === 404) {
        // Workflow not found, might have been cleaned up
        return null;
      }
      throw new Error(`Failed to fetch workflow status: ${response.statusText}`);
    }

    return await response.json();
  } catch (error) {
    console.error(`Failed to fetch workflow ${runId}:`, error);
    return null;
  }
}

/**
 * Hook to track a workflow and show flash message with polling
 */
export function useWorkflowFlash() {
  const { flash } = useFlashMessages();

  return (
    runId: string,
    initialMessage: string,
    options: WorkflowFlashOptions = {}
  ) => {
    const { onComplete, onError, displayName } = options;

    // Store workflow in localStorage
    storeWorkflow(runId, {
      runId,
      workflowName: displayName || "Workflow",
      displayName,
      createdAt: new Date().toISOString(),
    });

    // Create initial flash message
    const message = flash(initialMessage, "info", { removeAfter: null });

    // Start polling
    const intervalId = setInterval(async () => {
      const status = await fetchWorkflowStatus(runId);

      if (!status) {
        // Workflow not found, clean up
        message.remove();
        removeWorkflow(runId);
        clearInterval(intervalId);
        return;
      }

      // Update message based on status
      if (status.status === "completed") {
        message.update(
          initialMessage.replace("Processing", "Processed").replace("...", ""),
          "success",
          { removeAfter: AUTO_DISMISS_DELAY }
        );
        removeWorkflow(runId);
        clearInterval(intervalId);
        onComplete?.();
      } else if (status.status === "failed") {
        const errorMsg = status.error || "Unknown error";
        message.update(
          `${initialMessage.split("...")[0]} failed: ${errorMsg}`,
          "error",
          { removeAfter: null } // Keep error visible until user dismisses
        );
        removeWorkflow(runId);
        clearInterval(intervalId);
        onError?.(errorMsg);
      } else if (status.status === "cancelled") {
        message.update(
          `${initialMessage.split("...")[0]} cancelled`,
          "info",
          { removeAfter: AUTO_DISMISS_DELAY }
        );
        removeWorkflow(runId);
        clearInterval(intervalId);
      }
      // For "pending" or "running", keep polling
    }, POLL_INTERVAL);

    // Clean up interval if message is manually removed
    const originalRemove = message.remove;
    message.remove = () => {
      clearInterval(intervalId);
      removeWorkflow(runId);
      originalRemove();
    };

    return message;
  };
}

/**
 * Component to restore workflow status messages on page load
 * Should be mounted once in the admin layout
 */
export function WorkflowStatusRestorer() {
  const { flash } = useFlashMessages();
  const restoredRef = useRef(false);

  useEffect(() => {
    // Only restore once
    if (restoredRef.current) return;
    restoredRef.current = true;

    const workflows = getStoredWorkflows();
    const runIds = Object.keys(workflows);

    if (runIds.length === 0) return;

    // Check status of each stored workflow
    runIds.forEach(async (runId) => {
      const workflowData = workflows[runId];
      const status = await fetchWorkflowStatus(runId);

      if (!status) {
        // Workflow not found, remove from storage
        removeWorkflow(runId);
        return;
      }

      // If workflow is still running, create a flash message
      if (status.status === "pending" || status.status === "running") {
        const displayName = workflowData.displayName || workflowData.workflowName;
        const message = flash(`${displayName} in progress...`, "info", { removeAfter: null });

        // Start polling
        const intervalId = setInterval(async () => {
          const updatedStatus = await fetchWorkflowStatus(runId);

          if (!updatedStatus) {
            message.remove();
            removeWorkflow(runId);
            clearInterval(intervalId);
            return;
          }

          if (updatedStatus.status === "completed") {
            message.update(
              `${displayName} completed`,
              "success",
              { removeAfter: AUTO_DISMISS_DELAY }
            );
            removeWorkflow(runId);
            clearInterval(intervalId);
          } else if (updatedStatus.status === "failed") {
            message.update(
              `${displayName} failed: ${updatedStatus.error || "Unknown error"}`,
              "error",
              { removeAfter: null }
            );
            removeWorkflow(runId);
            clearInterval(intervalId);
          } else if (updatedStatus.status === "cancelled") {
            message.update(
              `${displayName} cancelled`,
              "info",
              { removeAfter: AUTO_DISMISS_DELAY }
            );
            removeWorkflow(runId);
            clearInterval(intervalId);
          }
        }, POLL_INTERVAL);

        // Clean up interval if message is manually removed
        const originalRemove = message.remove;
        message.remove = () => {
          clearInterval(intervalId);
          removeWorkflow(runId);
          originalRemove();
        };
      } else {
        // Workflow finished, clean up storage
        removeWorkflow(runId);
      }
    });
  }, [flash]);

  return null;
}
