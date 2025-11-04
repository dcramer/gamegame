"use client";

import { createContext, useContext, useEffect, useState, useCallback, useRef } from "react";

type ProcessingTask = {
  id: string;
  name: string;
  promise: Promise<any>;
};

type ProcessingContextValue = {
  runTask: <T>(name: string, promise: Promise<T>) => Promise<T>;
  activeTasks: Map<string, string>; // id -> name
};

const ProcessingContext = createContext<ProcessingContextValue>({
  runTask: async (name, promise) => promise,
  activeTasks: new Map(),
});

export function useProcessing() {
  return useContext(ProcessingContext);
}

let taskIdCounter = 0;

export default function ProcessingProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [activeTasks, setActiveTasks] = useState<Map<string, string>>(new Map());

  // Warn before closing/refreshing browser if tasks are active
  useEffect(() => {
    if (activeTasks.size === 0) return;

    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      return (e.returnValue =
        "Processing tasks are still running. Are you sure you want to leave?");
    };

    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [activeTasks.size]);

  const runTask = useCallback(async <T,>(name: string, promise: Promise<T>): Promise<T> => {
    const taskId = `task-${taskIdCounter++}`;

    // Register task
    setActiveTasks((prev) => {
      const next = new Map(prev);
      next.set(taskId, name);
      return next;
    });

    try {
      const result = await promise;
      return result;
    } finally {
      // Unregister task
      setActiveTasks((prev) => {
        const next = new Map(prev);
        next.delete(taskId);
        return next;
      });
    }
  }, []);

  return (
    <ProcessingContext.Provider value={{ runTask, activeTasks }}>
      {children}
    </ProcessingContext.Provider>
  );
}
