"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useFlashMessages } from "./flashMessages";
import type { FlashMessage } from "./flashMessages";

const POLL_INTERVAL = 3000; // 3 seconds

export type WorkflowStatus =
  | "pending"
  | "running"
  | "completed"
  | "failed"
  | "paused"
  | "cancelled";

interface WorkflowStatusData {
  runId: string;
  status: WorkflowStatus;
  workflowName: string;
  error?: string;
  createdAt: string;
  startedAt?: string;
  completedAt?: string;
  metadata?: Record<string, unknown> | null;
  resourceId?: string | null;
  attachmentId?: string | null;
  gameId?: string | null;
  localRunId?: string | null;
}

type WorkflowFlashCopy =
  | string
  | {
      pending: string;
      success?: string;
      failure?: (error: string) => string;
      cancelled?: string;
    };

interface WorkflowFlashOptions {
  onComplete?: () => void;
  onError?: (error: string) => void;
  displayName?: string;
  existingMessage?: FlashMessage;
}

type NormalizedCopy = {
  pending: string;
  success: string;
  failure: (error: string) => string;
  cancelled: string;
};

interface RunController {
  runId: string;
  normalizedCopy: NormalizedCopy;
  message: FlashMessage;
  options: WorkflowFlashOptions;
}

interface WorkflowStatusContextValue {
  registerRun: (
    runId: string,
    copy: WorkflowFlashCopy,
    options?: WorkflowFlashOptions
  ) => FlashMessage;
}

const WorkflowStatusContext = createContext<WorkflowStatusContextValue | null>(null);

function normalizeCopy(copy: WorkflowFlashCopy): NormalizedCopy {
  if (typeof copy === "string") {
    return {
      pending: copy,
      success: `${copy} completed`,
      failure: (error: string) => `${copy} failed: ${error}`,
      cancelled: `${copy} cancelled`,
    };
  }

  return {
    pending: copy.pending,
    success: copy.success ?? `${copy.pending} completed`,
    failure:
      copy.failure ??
      ((error: string) => `${copy.pending} failed: ${error}`),
    cancelled: copy.cancelled ?? `${copy.pending} cancelled`,
  };
}

function formatProgress(status: WorkflowStatusData, fallback: string): ReactNode {
  const metadata = status.metadata ?? {};
  const jobName = typeof metadata.jobName === "string" ? metadata.jobName : undefined;
  const label = typeof metadata.label === "string" ? metadata.label : undefined;
  const stage = typeof metadata.stage === "string" ? metadata.stage : undefined;
  const currentStatus =
    typeof metadata.status === "string"
      ? metadata.status
      : typeof metadata.message === "string"
        ? metadata.message
        : undefined;
  const percentValue = typeof metadata.progress === "number"
    ? Math.round(metadata.progress * 100)
    : typeof metadata.percent === "number"
      ? Math.round(metadata.percent)
      : undefined;
  const counts = typeof metadata.completed === "number" && typeof metadata.total === "number"
    ? `${metadata.completed}/${metadata.total}`
    : undefined;

  const title = jobName ?? label ?? fallback;
  const entityLink = buildEntityLink(status);

  // Build second line: status details
  const statusParts: string[] = [];

  // Show current status message (which should be the descriptive stage status)
  if (currentStatus) {
    statusParts.push(currentStatus);
  } else if (stage && stage !== title) {
    // Fallback to stage name if no status message
    statusParts.push(stage);
  }

  if (typeof percentValue === "number") {
    statusParts.push(`${percentValue}%`);
  }
  if (counts) {
    statusParts.push(counts);
  }

  const progressPercent = typeof percentValue === "number"
    ? Math.max(0, Math.min(100, percentValue))
    : null;

  return (
    <div className="flex flex-col gap-1">
      {/* Title */}
      <div className="font-medium">{title}</div>

      {/* Status line with permalink */}
      <div className="flex items-center gap-2 text-sm text-white/90">
        {statusParts.length > 0 && <span>{statusParts.join(" · ")}</span>}
        {entityLink && (
          <>
            {statusParts.length > 0 && <span className="text-white/40">—</span>}
            <a
              href={entityLink.href}
              target="_blank"
              rel="noreferrer"
              className="underline text-white/80 hover:text-white transition-colors"
            >
              {entityLink.label}
            </a>
          </>
        )}
      </div>

      {/* Progress bar */}
      {progressPercent !== null && (
        <div className="h-1.5 rounded-full bg-white/20 overflow-hidden">
          <div
            className="h-full bg-white transition-all"
            style={{ width: `${progressPercent}%` }}
          />
        </div>
      )}
    </div>
  );
}

function buildEntityLink(status: WorkflowStatusData) {
  if (status.resourceId && status.gameId) {
    return {
      href: `/admin/games/${status.gameId}/resources/${status.resourceId}`,
      label: "View resource",
    };
  }
  if (status.attachmentId && status.gameId) {
    return {
      href: `/admin/games/${status.gameId}/attachments/${status.attachmentId}`,
      label: "View attachment",
    };
  }
  return null;
}

function createDefaultCopy(status: WorkflowStatusData): NormalizedCopy {
  const label =
    (typeof status.metadata?.jobName === "string" && status.metadata?.jobName) ||
    (typeof status.metadata?.label === "string" && status.metadata?.label) ||
    status.workflowName;
  return {
    pending: `${label} running`,
    success: `${label} completed`,
    failure: (error: string) => `${label} failed: ${error}`,
    cancelled: `${label} cancelled`,
  };
}

export function WorkflowStatusProvider({ children }: { children: ReactNode }) {
  const { flash } = useFlashMessages();
  const controllersRef = useRef(new Map<string, RunController>());
  const pollInFlightRef = useRef(false);
  const [hasActiveWorkflows, setHasActiveWorkflows] = useState(false);

  const pollRef = useRef<() => Promise<void>>();

  const handleCancel = useCallback(async (runId: string) => {
    try {
      const response = await fetch(`/api/admin/workflows/${runId}`, {
        method: 'DELETE',
      });
      if (!response.ok) {
        throw new Error('Failed to cancel workflow');
      }
    } catch (error) {
      console.error('Failed to cancel workflow:', error);
    }
  }, []);

  const handleRetry = useCallback(async (runId: string) => {
    try {
      const response = await fetch(`/api/admin/workflows/${runId}/retry`, {
        method: 'POST',
      });
      if (!response.ok) {
        throw new Error('Failed to retry workflow');
      }
      // Poll immediately to pick up the new workflow
      if (pollRef.current) {
        void pollRef.current();
      }
    } catch (error) {
      console.error('Failed to retry workflow:', error);
    }
  }, []);

  const handleStatusUpdate = useCallback(
    (key: string, status: WorkflowStatusData) => {
      const controllers = controllersRef.current;
      const controller = controllers.get(key);
      if (!controller) return;

      const startedAt = status.startedAt
        ? new Date(status.startedAt).getTime()
        : status.createdAt
        ? new Date(status.createdAt).getTime()
        : undefined;

      if (status.status === "pending" || status.status === "running") {
        const text = formatProgress(status, controller.normalizedCopy.pending);
        const runId = status.runId ?? status.localRunId;
        controller.message.update(text, "info", {
          removeAfter: null,
          createdAt: startedAt,
          actions: runId ? [
            {
              label: "Cancel",
              onClick: () => void handleCancel(runId),
            },
          ] : undefined,
        });
        return;
      }

      if (status.status === "completed") {
        const text = formatProgress(status, controller.normalizedCopy.success);
        controller.message.update(text, "success", {
          removeAfter: 300000,
          createdAt: startedAt,
          actions: undefined,
        });
        controllers.delete(key);
        setHasActiveWorkflows(controllers.size > 0);
        controller.options.onComplete?.();
        return;
      }

      if (status.status === "failed") {
        const metaError =
          typeof status.metadata?.error === "string" ? status.metadata.error : undefined;
        const errorMsg = metaError || status.error || "Unknown error";
        const runId = status.runId ?? status.localRunId;
        controller.message.update(controller.normalizedCopy.failure(errorMsg), "error", {
          removeAfter: null, // Don't auto-dismiss errors
          createdAt: startedAt,
          actions: runId ? [
            {
              label: "Retry",
              onClick: () => void handleRetry(runId),
            },
          ] : undefined,
        });
        controllers.delete(key);
        setHasActiveWorkflows(controllers.size > 0);
        controller.options.onError?.(errorMsg);
        return;
      }

      if (status.status === "cancelled") {
        const text = formatProgress(status, controller.normalizedCopy.cancelled);
        controller.message.update(text, "warning", {
          removeAfter: 5000, // Auto-dismiss after 5 seconds
          createdAt: startedAt,
          actions: undefined,
        });
        controllers.delete(key);
        setHasActiveWorkflows(controllers.size > 0);
        return;
      }

      const text = formatProgress(status, controller.normalizedCopy.pending);
      controller.message.update(text, "info", { removeAfter: null, createdAt: startedAt });
    },
    [handleCancel, handleRetry]
  );

  const poll = useCallback(async () => {
    const controllers = controllersRef.current;
    if (controllers.size === 0) return;
    if (pollInFlightRef.current) return;

    pollInFlightRef.current = true;

    try {
      const params = new URLSearchParams();
      controllers.forEach((_, runId) => {
        params.append("runId", runId);
      });
      const response = await fetch(`/api/admin/workflows?${params.toString()}`);
      if (!response.ok) {
        throw new Error(`Failed to poll workflows: ${response.status}`);
      }
      const statuses: WorkflowStatusData[] = await response.json();
      const statusMap = new Map<string, WorkflowStatusData>();
      for (const status of statuses) {
        if (status.runId) statusMap.set(status.runId, status);
        if (status.localRunId) statusMap.set(status.localRunId, status);
      }
      controllers.forEach((_, runId) => {
        const status = statusMap.get(runId);
        if (status) {
          handleStatusUpdate(runId, status);
        } else {
          // Workflow no longer exists in the API response
          // This means it was completed/failed and removed from active tracking
          // Treat as completed to clean up the notification
          const controller = controllers.get(runId);
          if (controller) {
            controller.message.update(controller.normalizedCopy.success, "success", {
              removeAfter: 5000,
            });
            controllers.delete(runId);
            setHasActiveWorkflows(controllers.size > 0);
            controller.options.onComplete?.();
          }
        }
      });
    } catch (error) {
      console.error("Failed to poll workflow statuses", error);
    } finally {
      pollInFlightRef.current = false;
    }
  }, [handleStatusUpdate]);

  // Store poll function in ref for handleRetry
  useEffect(() => {
    pollRef.current = poll;
  }, [poll]);

  useEffect(() => {
    // Only poll if there are active workflows
    if (!hasActiveWorkflows) {
      return;
    }

    const intervalId = setInterval(() => {
      void poll();
    }, POLL_INTERVAL);
    return () => clearInterval(intervalId);
  }, [poll, hasActiveWorkflows]);

  const registerInternal = useCallback(
    (controller: RunController, initialStatus?: WorkflowStatusData) => {
      const controllers = controllersRef.current;
      const existing = controllers.get(controller.runId);
      if (existing) {
        controllers.set(controller.runId, {
          ...existing,
          normalizedCopy: controller.normalizedCopy,
          options: controller.options,
        });
        return existing.message;
      }

      const originalRemove = controller.message.remove;
      controller.message.remove = () => {
        controllers.delete(controller.runId);
        setHasActiveWorkflows(controllers.size > 0);
        originalRemove();
      };

      controllers.set(controller.runId, controller);
      setHasActiveWorkflows(true);

      if (initialStatus) {
        handleStatusUpdate(controller.runId, initialStatus);
      } else {
        void poll();
      }
      return controller.message;
    },
    [handleStatusUpdate, poll]
  );

  const upsertStatus = useCallback(
    (status: WorkflowStatusData) => {
      const runId = status.runId ?? status.localRunId;
      if (!runId) return;

      if (controllersRef.current.has(runId)) {
        handleStatusUpdate(runId, status);
        return;
      }

      const normalizedCopy = createDefaultCopy(status);
      const startedAt = status.startedAt
        ? new Date(status.startedAt).getTime()
        : status.createdAt
        ? new Date(status.createdAt).getTime()
        : undefined;
      const message = flash(formatProgress(status, normalizedCopy.pending), "info", {
        removeAfter: null,
        createdAt: startedAt,
      });

      registerInternal(
        {
          runId,
          normalizedCopy,
          message,
          options: {},
        },
        status
      );
    },
    [flash, handleStatusUpdate, registerInternal]
  );

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const response = await fetch("/api/admin/workflows");
        if (!response.ok) {
          throw new Error(`Failed to hydrate workflows: ${response.status}`);
        }
        const statuses: WorkflowStatusData[] = await response.json();
        if (cancelled) return;
        statuses.forEach(upsertStatus);
        if (statuses.length > 0) {
          void poll();
        }
      } catch (error) {
        console.error("Failed to hydrate workflow statuses", error);
      }
    })();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Only run once on mount

  useEffect(() => {
    return () => {
      controllersRef.current.clear();
    };
  }, []);

  const registerRun = useCallback(
    (
      runId: string,
      copy: WorkflowFlashCopy,
      options: WorkflowFlashOptions = {}
    ) => {
      const normalizedCopy = normalizeCopy(copy);
      const message = options.existingMessage
        ? (options.existingMessage.update(normalizedCopy.pending, "info", { removeAfter: null }),
          options.existingMessage)
        : flash(normalizedCopy.pending, "info", { removeAfter: null });

      const controller: RunController = {
        runId,
        normalizedCopy,
        message,
        options,
      };

      return registerInternal(controller);
    },
    [flash, registerInternal]
  );

  const contextValue = useMemo<WorkflowStatusContextValue>(() => ({ registerRun }), [registerRun]);

  return (
    <WorkflowStatusContext.Provider value={contextValue}>
      {children}
    </WorkflowStatusContext.Provider>
  );
}

export function useWorkflowFlash() {
  const context = useContext(WorkflowStatusContext);
  if (!context) {
    throw new Error('WorkflowStatusProvider is not mounted');
  }
  return context.registerRun;
}
