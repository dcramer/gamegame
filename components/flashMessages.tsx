"use client";

import { cn } from "@/lib/utils";
import { createContext, useContext, useState, type ReactNode } from "react";
import { useIntervalEffect } from "@react-hookz/web";

const ALIVE_TIME = 8000; // 8 seconds

let messageNum = 0;

type FlashType = "success" | "error" | "info";

type FlashMessageOptions = {
  removeAfter?: number | null;
};

type FlashMessage = {
  id: number;
  message: string | ReactNode;
  type: FlashType;
  removeAfter: number | null;

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

export function Message({
  message,
  type,
}: Pick<FlashMessage, "message" | "type">) {
  return (
    <div
      className={cn(
        "rounded-md p-3 font-semibold opacity-90",
        type === "success" ? "bg-green-700 text-green-50" : "",
        type === "error" ? "bg-red-700 text-red-50" : "",
        type === "info" ? "bg-slate-700 text-slate-50" : ""
      )}
    >
      {message}
    </div>
  );
}

function isNotExpired(message: FlashMessage) {
  if (!message.removeAfter) return true;
  return message.removeAfter > new Date().getTime();
}

export default function FlashMessages({ children }: { children: ReactNode }) {
  const [messages, setMessages] = useState<FlashMessage[]>([]);

  useIntervalEffect(() => {
    setMessages((messages) => {
      return messages.filter(isNotExpired);
    });
  }, 1000);

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
                    const updatedFlash = {
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

                    console.log(updatedFlash);

                    return updatedFlash;
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
          <Message {...m} key={m.id} />
        ))}
      </div>
      {children}
    </FlashContext.Provider>
  );
}
