import { useEffect, useRef, useState } from 'react';

/**
 * Custom hook for setting up a timeout with automatic cleanup.
 * The timeout is cleared when the component unmounts or when delay changes to null.
 *
 * @example
 * // Show success message for 3 seconds
 * const [showSuccess, setShowSuccess] = useState(false);
 *
 * useTimeout(() => {
 *   setShowSuccess(false);
 * }, showSuccess ? 3000 : null);
 *
 * @example
 * // Debounce an action
 * const [debouncedValue, setDebouncedValue] = useState('');
 *
 * useTimeout(() => {
 *   setDebouncedValue(inputValue);
 * }, 500);
 *
 * @param callback - Function to call after the timeout
 * @param delay - Delay in milliseconds, or null to cancel the timeout
 */
export function useTimeout(callback: () => void, delay: number | null) {
  const savedCallback = useRef(callback);

  // Remember the latest callback if it changes
  useEffect(() => {
    savedCallback.current = callback;
  }, [callback]);

  // Set up the timeout
  useEffect(() => {
    // Don't schedule if delay is null
    if (delay === null) {
      return;
    }

    const id = setTimeout(() => savedCallback.current(), delay);

    // Cleanup function
    return () => clearTimeout(id);
  }, [delay]);
}

/**
 * Custom hook for debouncing a value.
 * Returns the debounced value that only updates after the delay period.
 *
 * @example
 * const [searchTerm, setSearchTerm] = useState('');
 * const debouncedSearchTerm = useDebounce(searchTerm, 500);
 *
 * useEffect(() => {
 *   if (debouncedSearchTerm) {
 *     performSearch(debouncedSearchTerm);
 *   }
 * }, [debouncedSearchTerm]);
 */
export function useDebounce<T>(value: T, delay: number): T {
  const [debouncedValue, setDebouncedValue] = useState<T>(value);

  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedValue(value);
    }, delay);

    // Cleanup on value change or unmount
    return () => {
      clearTimeout(handler);
    };
  }, [value, delay]);

  return debouncedValue;
}
