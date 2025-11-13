"use client";

import { useEffect, type ReactNode } from "react";
import { useFlashMessages } from "./flashMessages";
import type { FlashMessage } from "./flashMessages";

const POLL_INTERVAL = 3000; // 3 seconds
const AUTO_DISMISS_DELAY = 300000; // 5 minutes for workflow completions

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

const controllers = new Map<string, RunController>();
let pollTimer: ReturnType<typeof setTimeout> | null = null;
let pollInFlight = false;
let lastPollTime = 0;

function clearPollingIfIdle() {
  if (controllers.size === 0 && pollTimer) {
    clearTimeout(pollTimer);
    pollTimer = null;
  }
}

type FlashFn = ReturnType<typeof useFlashMessages>["flash"];

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

  const header = jobName ?? label ?? fallback;
  const details: string[] = [];
  if (typeof percentValue === "number") {
    details.push(`${percentValue}%`);
  }
  if (counts) {
    details.push(counts);
  }
  if (stage && stage !== header) {
    details.push(stage);
  }
  if (currentStatus) {
    details.push(currentStatus);
  }

  const text = [header, ...details].filter(Boolean).join(" · ");
  const progressPercent = typeof percentValue === "number" ? Math.max(0, Math.min(100, percentValue)) : null;
  const entityLink = buildEntityLink(status);

  return (
    <div className="flex flex-col gap-1">
      <span>{text}</span>
      {progressPercent !== null && (
        <div className="h-1.5 rounded-full bg-white/20 overflow-hidden">
          <div
            className="h-full bg-white transition-all"
            style={{ width: `${progressPercent}%` }}
          />
        </div>
      )}
      {entityLink && (
        <a
          href={entityLink.href}
          target="_blank"
          rel="noreferrer"
          className="text-xs underline text-white/80 hover:text-white transition-colors"
        >
          {entityLink.label}
        </a>
      )}
    </div>
  );
}

function schedulePolling() {
  if (pollTimer || controllers.size === 0) return;
  pollTimer = setTimeout(async () => {
    pollTimer = null;
    await pollActiveControllers();
    schedulePolling();
  }, POLL_INTERVAL);
}

async function pollActiveControllers(force = false) {
  if (pollInFlight || controllers.size === 0) {
    return;
  }
  const now = Date.now();
  if (!force && now - lastPollTime < POLL_INTERVAL) {
    return;
  }
  pollInFlight = true;
  lastPollTime = now;

  const params = new URLSearchParams();
  for (const runId of controllers.keys()) {
    params.append("runId", runId);
  }

  try {
    const response = await fetch(`/api/admin/workflows?${params.toString()}`);
    if (!response.ok) {
      throw new Error(`Failed to fetch workflow statuses: ${response.status}`);
    }
    const statuses: WorkflowStatusData[] = await response.json();
    const statusMap = new Map<string, WorkflowStatusData>();
    for (const status of statuses) {
      if (status.runId) {
        statusMap.set(status.runId, status);
      }
      if (status.localRunId) {
        statusMap.set(status.localRunId, status);
      }
    }

    for (const [runId, controller] of controllers) {
      const status = statusMap.get(runId);
      if (!status) {
        controller.message.remove();
        controllers.delete(runId);
        continue;
      }
      handleStatusUpdate(runId, status);
    }
  } catch (error) {
    console.error("Failed to poll workflow statuses", error);
  } finally {
    pollInFlight = false;
  }
}

function handleStatusUpdate(runId: string, status: WorkflowStatusData) {
  const controller = controllers.get(runId);
  if (!controller) return;

  if (status.status === "pending" || status.status === "running") {
    const text = formatProgress(status, controller.normalizedCopy.pending);
    controller.message.update(text, "info", {
      removeAfter: null,
      createdAt: status.startedAt
        ? new Date(status.startedAt).getTime()
        : status.createdAt
        ? new Date(status.createdAt).getTime()
        : undefined,
    });
    return;
  }

  if (status.status === "completed") {
    const text = formatProgress(status, controller.normalizedCopy.success);
    controller.message.update(text, "success", {
      removeAfter: AUTO_DISMISS_DELAY,
      createdAt: status.startedAt
        ? new Date(status.startedAt).getTime()
        : status.createdAt
        ? new Date(status.createdAt).getTime()
        : undefined,
    });
    controllers.delete(runId);
    clearPollingIfIdle();
    controller.options.onComplete?.();
    return;
  }

  if (status.status === "failed") {
    const metaError =
      typeof status.metadata?.error === "string"
        ? status.metadata.error
        : undefined;
    const errorMsg = metaError || status.error || "Unknown error";
    controller.message.update(controller.normalizedCopy.failure(errorMsg), "error", {
      removeAfter: null,
      createdAt: status.startedAt
        ? new Date(status.startedAt).getTime()
        : status.createdAt
        ? new Date(status.createdAt).getTime()
        : undefined,
    });
    controllers.delete(runId);
    clearPollingIfIdle();
    controller.options.onError?.(errorMsg);
    return;
  }

  if (status.status === "cancelled") {
    const text = formatProgress(status, controller.normalizedCopy.cancelled);
    controller.message.update(text, "info", {
      removeAfter: AUTO_DISMISS_DELAY,
      createdAt: status.startedAt
        ? new Date(status.startedAt).getTime()
        : status.createdAt
        ? new Date(status.createdAt).getTime()
        : undefined,
    });
    controllers.delete(runId);
    clearPollingIfIdle();
    return;
  }

  // paused or other states
  const text = formatProgress(status, controller.normalizedCopy.pending);
  controller.message.update(text, "info", { removeAfter: null });
}

function registerController(controller: RunController, initialStatus?: WorkflowStatusData) {
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
    clearPollingIfIdle();
    originalRemove();
  };

  controllers.set(controller.runId, controller);

  if (initialStatus) {
    handleStatusUpdate(controller.runId, initialStatus);
  }

  if (!initialStatus) {
    void pollActiveControllers(true);
  }

  schedulePolling();

  return controller.message;
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

function upsertRemoteStatus(status: WorkflowStatusData, flash: FlashFn) {
  const runId = status.runId || status.localRunId;
  if (!runId) return;

  if (controllers.has(runId)) {
    handleStatusUpdate(runId, status);
    return;
  }

  const normalizedCopy = createDefaultCopy(status);
  const startedAt = status.startedAt
    ? new Date(status.startedAt).getTime()
    : status.createdAt
    ? new Date(status.createdAt).getTime()
    : undefined;
  const messageText = formatProgress(status, normalizedCopy.pending);
  const message = flash(messageText, "info", {
    removeAfter: null,
    createdAt: startedAt,
  });
  registerController(
    {
      runId,
      normalizedCopy,
      message,
      options: {},
    },
    status
  );
}

export function useWorkflowFlash() {
  const { flash } = useFlashMessages();

  return (
    runId: string,
    copy: WorkflowFlashCopy,
    options: WorkflowFlashOptions = {}
  ) => {
    const normalizedCopy = normalizeCopy(copy);

    const message = options.existingMessage
      ? options.existingMessage
      : flash(normalizedCopy.pending, "info", { removeAfter: null });

    if (options.existingMessage) {
      options.existingMessage.update(normalizedCopy.pending, "info", {
        removeAfter: null,
      });
    }

    const controller: RunController = {
      runId,
      normalizedCopy,
      message,
      options,
    };

    registerController(controller);
    return message;
  };
}

export function WorkflowStatusRestorer() {
  const { flash } = useFlashMessages();

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
        statuses.forEach((status) => {
          upsertRemoteStatus(status, flash);
        });
      } catch (error) {
        console.error("Failed to hydrate workflow statuses", error);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [flash]);

  return null;
}
