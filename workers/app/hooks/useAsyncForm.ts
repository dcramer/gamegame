import { useState, useCallback } from 'react';
import { apiClient } from '../../load-context';

export interface UseAsyncFormOptions<T = any, R = any> {
  onSubmit: (data: T) => Promise<R>;
  onSuccess?: (result: R) => void;
  onError?: (error: Error) => void;
}

export interface AsyncFormState {
  loading: boolean;
  error: string | null;
  isSuccess: boolean;
}

/**
 * Custom hook for handling async form submissions with loading and error states.
 * Replaces repetitive try/catch patterns around form submissions.
 *
 * @example
 * const { handleSubmit, loading, error } = useAsyncForm({
 *   onSubmit: async (data) => {
 *     const response = await fetch('/api/endpoint', {
 *       method: 'POST',
 *       body: JSON.stringify(data)
 *     });
 *     return response.json();
 *   },
 *   onSuccess: (result) => {
 *     console.log('Success!', result);
 *   }
 * });
 *
 * <form onSubmit={(e) => handleSubmit(e, formData)}>
 *   {error && <div>{error}</div>}
 *   <button disabled={loading}>Submit</button>
 * </form>
 */
export function useAsyncForm<T = any, R = any>(
  options: UseAsyncFormOptions<T, R>
): AsyncFormState & {
  handleSubmit: (e: React.FormEvent, data: T) => Promise<void>;
  reset: () => void;
} {
  const { onSubmit, onSuccess, onError } = options;
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isSuccess, setIsSuccess] = useState(false);

  const handleSubmit = useCallback(
    async (e: React.FormEvent, data: T) => {
      e.preventDefault();
      setLoading(true);
      setError(null);
      setIsSuccess(false);

      try {
        const result = await onSubmit(data);
        setIsSuccess(true);
        if (onSuccess) {
          onSuccess(result);
        }
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : 'An error occurred';
        setError(errorMessage);
        if (onError) {
          onError(err instanceof Error ? err : new Error(errorMessage));
        }
      } finally {
        setLoading(false);
      }
    },
    [onSubmit, onSuccess, onError]
  );

  const reset = useCallback(() => {
    setLoading(false);
    setError(null);
    setIsSuccess(false);
  }, []);

  return {
    handleSubmit,
    loading,
    error,
    isSuccess,
    reset,
  };
}

/**
 * Simplified version for common API-based form submissions using apiClient.
 *
 * @example
 * const { handleSubmit, loading, error } = useApiForm({
 *   url: '/games',
 *   method: 'POST',
 *   onSuccess: (data) => navigate(`/games/${data.id}`)
 * });
 */
export function useApiForm<T = any, R = any>(options: {
  url: string;
  method?: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
  headers?: HeadersInit;
  onSuccess?: (result: R) => void;
  onError?: (error: Error) => void;
}) {
  const { url, method = 'POST', headers = {}, onSuccess, onError } = options;

  return useAsyncForm<T, R>({
    onSubmit: async (data) => {
      const response = await apiClient.fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
          ...headers,
        },
        body: method !== 'GET' ? JSON.stringify(data) : undefined,
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      return response.json();
    },
    onSuccess,
    onError,
  });
}
