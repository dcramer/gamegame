import { useState, useCallback } from 'react';

export interface FormState<T = Record<string, any>> {
  values: T;
  setField: <K extends keyof T>(field: K, value: T[K]) => void;
  setFields: (fields: Partial<T>) => void;
  reset: (newValues?: T) => void;
}

/**
 * Custom hook for managing form state with simplified field updates.
 * Replaces repetitive useState declarations for each form field.
 *
 * @example
 * const form = useFormState({
 *   name: '',
 *   email: '',
 *   description: ''
 * });
 *
 * // Update single field
 * form.setField('name', 'New Name');
 *
 * // Update multiple fields
 * form.setFields({ name: 'John', email: 'john@example.com' });
 *
 * // Reset form
 * form.reset();
 */
export function useFormState<T extends Record<string, any>>(
  initialState: T
): FormState<T> {
  const [values, setValues] = useState<T>(initialState);

  const setField = useCallback(<K extends keyof T>(field: K, value: T[K]) => {
    setValues((prev) => ({ ...prev, [field]: value }));
  }, []);

  const setFields = useCallback((fields: Partial<T>) => {
    setValues((prev) => ({ ...prev, ...fields }));
  }, []);

  const reset = useCallback(
    (newValues?: T) => {
      setValues(newValues || initialState);
    },
    [initialState]
  );

  return { values, setField, setFields, reset };
}

/**
 * Custom hook for managing async operation state (loading, error, status).
 * Commonly used alongside form submissions.
 *
 * @example
 * const saveState = useAsyncState();
 *
 * async function handleSave() {
 *   saveState.setLoading();
 *   try {
 *     await saveData();
 *     saveState.setSuccess();
 *   } catch (error) {
 *     saveState.setError(error);
 *   }
 * }
 */
export interface AsyncState {
  status: 'idle' | 'loading' | 'success' | 'error';
  error: string | null;
  isLoading: boolean;
  isSuccess: boolean;
  isError: boolean;
  setLoading: () => void;
  setSuccess: () => void;
  setError: (error: Error | string) => void;
  reset: () => void;
}

export function useAsyncState(): AsyncState {
  const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [error, setErrorMessage] = useState<string | null>(null);

  const setLoading = useCallback(() => {
    setStatus('loading');
    setErrorMessage(null);
  }, []);

  const setSuccess = useCallback(() => {
    setStatus('success');
    setErrorMessage(null);
  }, []);

  const setError = useCallback((error: Error | string) => {
    setStatus('error');
    setErrorMessage(error instanceof Error ? error.message : error);
  }, []);

  const reset = useCallback(() => {
    setStatus('idle');
    setErrorMessage(null);
  }, []);

  return {
    status,
    error,
    isLoading: status === 'loading',
    isSuccess: status === 'success',
    isError: status === 'error',
    setLoading,
    setSuccess,
    setError,
    reset,
  };
}
