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

type FlashType = "success" | "error" | "info";

type FlashMessageOptions = {
  removeAfter?: number | null;
};

export type FlashMessage = {
  id: number;
  message: string | ReactNode;
  type: FlashType;
  removeAfter: number | null;
  createdAt: number;

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
  onDismiss,
}: Pick<FlashMessage, "message" | "type" | "createdAt"> & {
  onDismiss?: () => void;
}) {
  const [elapsed, setElapsed] = useState(() => Date.now() - createdAt);

  useEffect(() => {
    const intervalId = setInterval(() => {
      setElapsed(Date.now() - createdAt);
    }, 1000);
    return () => clearInterval(intervalId);
  }, [createdAt]);

  return (
    <div
      className={cn(
        "rounded-md p-3 font-semibold opacity-90 relative pr-10 flex flex-col gap-1",
        type === "success" ? "bg-green-700 text-green-50" : "",
        type === "error" ? "bg-red-700 text-red-50" : "",
        type === "info" ? "bg-slate-700 text-slate-50" : ""
      )}
    >
      <div>{message}</div>
      <span className="text-xs font-medium uppercase tracking-wide text-white/70">
        {formatElapsed(elapsed)}
      </span>
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
          { removeAfter = ALIVE_TIME }: FlashMessageOptions = {
            removeAfter: ALIVE_TIME,
          }
        ) => {
          const newFlash = {
            message,
            type,
            id: messageNum,
            createdAt: Date.now(),

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
                    return {
                      ...m,
                      message,
                      type: type ?? m.type,
                      removeAfter:
                        options?.removeAfter === null
                          ? null
                          : options?.removeAfter
                          ? new Date().getTime() + options?.removeAfter
                          : m.removeAfter,
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
      <div className="fixed right-0 top-0 z-50 flex max-w-xl flex-col gap-y-4 p-4">
        {messages.map((m) => (
          <Message {...m} key={m.id} onDismiss={m.remove} />
        ))}
      </div>
      {children}
    </FlashContext.Provider>
  );
}
