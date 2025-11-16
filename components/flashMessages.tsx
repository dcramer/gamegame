"use client";

import { cn } from "@/lib/utils";
import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";

const ALIVE_TIME = 5000; // ms

let messageNum = 0;

type FlashType = "success" | "error" | "info" | "warning";

type FlashAction = {
  label: string;
  onClick?: () => void;
  href?: string;
  align?: "left" | "right";
};

type FlashMessageOptions = {
  removeAfter?: number | null;
  createdAt?: number;
  completedAt?: number;
  actions?: FlashAction[];
};

export type FlashMessage = {
  id: number;
  message: string | ReactNode;
  type: FlashType;
  removeAfter: number | null;
  createdAt: number;
  completedAt?: number;
  actions?: FlashAction[];

  update: (
    message: string | ReactNode,
    type?: FlashType,
    options?: FlashMessageOptions
  ) => void;
  remove: () => void;
};

const FlashContext = createContext<{
  flash: (
    message: string | ReactNode,
    type?: FlashType,
    options?: FlashMessageOptions
  ) => FlashMessage;
}>({
  flash: () => {
    throw new Error("FlashContext not initialized");
  },
});

export function useFlashMessages() {
  return useContext(FlashContext);
}

function formatElapsed(ms: number) {
  const seconds = Math.max(0, Math.floor(ms / 1000));
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;

  if (minutes === 0) {
    return `${seconds}s`;
  }

  return `${minutes}m ${remainingSeconds.toString().padStart(2, "0")}s`;
}

export function Message({
  message,
  type,
  createdAt,
  completedAt,
  onDismiss,
  actions,
}: Pick<FlashMessage, "message" | "type" | "createdAt" | "completedAt" | "actions"> & {
  onDismiss?: () => void;
}) {
  const [elapsed, setElapsed] = useState(() =>
    completedAt ? completedAt - createdAt : Date.now() - createdAt
  );

  useEffect(() => {
    // Don't update timer if already completed
    if (completedAt) {
      setElapsed(completedAt - createdAt);
      return;
    }

    const intervalId = setInterval(() => {
      setElapsed(Date.now() - createdAt);
    }, 1000);
    return () => clearInterval(intervalId);
  }, [createdAt, completedAt]);

  return (
    <div
      className={cn(
        "rounded-md p-3 font-semibold opacity-90 relative pr-10 flex flex-col gap-2",
        type === "success" ? "bg-green-700 text-green-50" : "",
        type === "error" ? "bg-red-700 text-red-50" : "",
        type === "info" ? "bg-slate-700 text-slate-50" : "",
        type === "warning" ? "bg-yellow-700 text-yellow-50" : ""
      )}
    >
      <div>{message}</div>
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium uppercase tracking-wide text-white/70 min-w-[3rem] tabular-nums">
            {formatElapsed(elapsed)}
          </span>
          {actions && actions.filter((a) => a.align !== "right").length > 0 && (
            <div className="flex gap-2">
              {actions
                .filter((a) => a.align !== "right")
                .map((action, i) =>
                  action.href ? (
                    <a
                      key={i}
                      href={action.href}
                      target="_blank"
                      rel="noreferrer"
                      className="text-xs font-semibold uppercase tracking-wide underline hover:text-white/90 transition-colors"
                    >
                      {action.label}
                    </a>
                  ) : (
                    <button
                      key={i}
                      onClick={action.onClick}
                      className="text-xs font-semibold uppercase tracking-wide underline hover:text-white/90 transition-colors cursor-pointer"
                    >
                      {action.label}
                    </button>
                  )
                )}
            </div>
          )}
        </div>
        {actions && actions.filter((a) => a.align === "right").length > 0 && (
          <div className="flex gap-2">
            {actions
              .filter((a) => a.align === "right")
              .map((action, i) => (
                <button
                  key={i}
                  onClick={action.onClick}
                  className="text-xs font-semibold uppercase tracking-wide underline hover:text-white/90 transition-colors cursor-pointer"
                >
                  {action.label}
                </button>
              ))}
          </div>
        )}
      </div>
      {onDismiss && (
        <button
          onClick={onDismiss}
          className="absolute right-2 top-2 p-1 rounded hover:bg-black/20 transition-colors"
          aria-label="Dismiss message"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      )}
    </div>
  );
}

function isNotExpired(message: FlashMessage) {
  if (!message.removeAfter) return true;
  return message.removeAfter > new Date().getTime();
}

export default function FlashMessages({ children }: { children: ReactNode }) {
  const [messages, setMessages] = useState<FlashMessage[]>([]);

  useEffect(() => {
    setMessages((messages) => {
      return messages.filter(isNotExpired);
    });
    const intervalId = setInterval(() => {
      setMessages((messages) => messages.filter(isNotExpired));
    }, 1000);
    return () => clearInterval(intervalId);
  }, []);

  return (
    <FlashContext.Provider
      value={{
        flash: (
          message: string | ReactNode,
          type: FlashType = "success",
          options: FlashMessageOptions = { removeAfter: ALIVE_TIME }
        ) => {
          const { removeAfter = ALIVE_TIME, createdAt, completedAt, actions } = options;
          const newFlash = {
            message,
            type,
            id: messageNum,
            createdAt: createdAt ?? Date.now(),
            completedAt,
            actions,

            removeAfter: removeAfter
              ? new Date().getTime() + removeAfter
              : null,

            remove: () => {
              setMessages((messages) => {
                return messages.filter((m) => m.id !== newFlash.id);
              });
            },

            update: (
              message: string | ReactNode,
              type?: FlashType,
              options?: FlashMessageOptions
            ) => {
              setMessages((messages) => {
                return messages.map((m) => {
                  if (m.id === newFlash.id) {
                    // Calculate new removeAfter time
                    let newRemoveAfter: number | null;
                    if (options?.removeAfter === null) {
                      newRemoveAfter = null;
                    } else if (options?.removeAfter !== undefined) {
                      // Always calculate from current time to avoid negative values
                      newRemoveAfter = new Date().getTime() + options.removeAfter;
                    } else {
                      newRemoveAfter = m.removeAfter;
                    }

                    return {
                      ...m,
                      message,
                      type: type ?? m.type,
                      createdAt:
                        options?.createdAt !== undefined
                          ? options.createdAt
                          : m.createdAt,
                      completedAt:
                        options?.completedAt !== undefined
                          ? options.completedAt
                          : m.completedAt,
                      removeAfter: newRemoveAfter,
                      actions: options?.actions ?? m.actions,
                    };
                  } else {
                    return m;
                  }
                });
              });
            },
          };
          setMessages((messages) => {
            return [...messages.filter(isNotExpired), newFlash];
          });
          messageNum += 1;
          return newFlash;
        },
      }}
    >
      <div className="fixed right-0 top-0 z-50 flex w-full md:w-auto md:min-w-[400px] md:max-w-xl flex-col gap-y-4 p-4">
        {messages.map((m) => (
          <Message {...m} key={m.id} onDismiss={m.remove} />
        ))}
      </div>
      {children}
    </FlashContext.Provider>
  );
}
