import { useEffect, useRef, useState, useCallback } from 'react';

/**
 * Custom hook for setting up an interval with automatic cleanup.
 * The interval is cleared when the component unmounts or when delay changes to null.
 *
 * @example
 * // Poll every 2 seconds
 * useInterval(() => {
 *   fetchData();
 * }, 2000);
 *
 * @example
 * // Conditional polling
 * const [isPolling, setIsPolling] = useState(true);
 * useInterval(() => {
 *   fetchData();
 * }, isPolling ? 2000 : null);
 *
 * @param callback - Function to call on each interval
 * @param delay - Delay in milliseconds, or null to pause the interval
 */
export function useInterval(callback: () => void, delay: number | null) {
  const savedCallback = useRef(callback);

  // Remember the latest callback if it changes
  useEffect(() => {
    savedCallback.current = callback;
  }, [callback]);

  // Set up the interval
  useEffect(() => {
    // Don't schedule if delay is null
    if (delay === null) {
      return;
    }

    const id = setInterval(() => savedCallback.current(), delay);

    // Cleanup function
    return () => clearInterval(id);
  }, [delay]);
}

/**
 * Custom hook for polling that includes a loading state.
 * Automatically cleans up when component unmounts.
 *
 * @example
 * const { isPolling, startPolling, stopPolling } = usePolling(
 *   async () => {
 *     const data = await fetchJobStatus(jobId);
 *     if (data.status === 'completed') {
 *       stopPolling();
 *     }
 *   },
 *   2000
 * );
 *
 * // Start polling manually
 * useEffect(() => {
 *   if (jobId) {
 *     startPolling();
 *   }
 * }, [jobId]);
 */
export function usePolling(
  callback: () => void | Promise<void>,
  delay: number,
  options?: {
    immediate?: boolean; // Call immediately on start
  }
) {
  const [isPolling, setIsPolling] = useState(options?.immediate ?? false);
  const savedCallback = useRef(callback);

  // Remember the latest callback
  useEffect(() => {
    savedCallback.current = callback;
  }, [callback]);

  // Set up the interval when polling is active
  useEffect(() => {
    if (!isPolling) {
      return;
    }

    // Call immediately if requested
    if (options?.immediate) {
      savedCallback.current();
    }

    const id = setInterval(() => savedCallback.current(), delay);

    // Cleanup function
    return () => clearInterval(id);
  }, [isPolling, delay, options?.immediate]);

  const startPolling = useCallback(() => {
    setIsPolling(true);
  }, []);

  const stopPolling = useCallback(() => {
    setIsPolling(false);
  }, []);

  return { isPolling, startPolling, stopPolling };
}
