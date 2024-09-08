"use client";

import { cn } from "@/lib/utils";
import { createContext, useContext, useState, type ReactNode } from "react";
import { useIntervalEffect } from "@react-hookz/web";

const ALIVE_TIME = 8000; // 8 seconds

let messageNum = 0;

type FlashType = "success" | "error" | "info";

type FlashMessage = {
  id: number;
  message: string | ReactNode;
  type: FlashType;
  createdAt: number;
};

const FlashContext = createContext<{
  flash: (message: string | ReactNode, type?: FlashType) => void;
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

export default function FlashMessages({ children }: { children: ReactNode }) {
  const [messages, setMessages] = useState<FlashMessage[]>([]);

  useIntervalEffect(() => {
    setMessages((messages) => {
      const cutoff = new Date().getTime() - ALIVE_TIME;
      return messages.filter((m) => m.createdAt > cutoff);
    });
  }, 1000);

  return (
    <FlashContext.Provider
      value={{
        flash: (message: string | ReactNode, type: FlashType = "success") => {
          const newFlash = {
            message,
            type,
            id: messageNum,
            createdAt: new Date().getTime(),
          };
          setMessages((messages) => {
            const cutoff = new Date().getTime() - ALIVE_TIME;
            return [...messages.filter((m) => m.createdAt > cutoff), newFlash];
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
