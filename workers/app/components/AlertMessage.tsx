import { type ReactNode } from 'react';

export interface AlertMessageProps {
  variant: 'error' | 'success' | 'warning' | 'info';
  message: ReactNode;
  onDismiss?: () => void;
  className?: string;
}

/**
 * Reusable alert message component for displaying errors, success messages, warnings, and info.
 * Replaces repetitive alert div patterns across the codebase.
 *
 * @example
 * <AlertMessage variant="error" message="Failed to save" />
 * <AlertMessage variant="success" message="Saved successfully!" />
 * <AlertMessage
 *   variant="warning"
 *   message="This action cannot be undone"
 *   onDismiss={() => setWarning(null)}
 * />
 */
export function AlertMessage({
  variant,
  message,
  onDismiss,
  className = '',
}: AlertMessageProps) {
  const variants = {
    error: 'bg-destructive text-destructive-foreground',
    success: 'bg-green-600 text-white',
    warning: 'bg-yellow-600 text-white',
    info: 'bg-blue-600 text-white',
  };

  return (
    <div
      className={`${variants[variant]} font-bold p-2 lg:p-3 rounded mb-4 flex items-center justify-between gap-3 ${className}`}
      role="alert"
    >
      <span className="flex-1">{message}</span>
      {onDismiss && (
        <button
          onClick={onDismiss}
          className="hover:opacity-80 transition-opacity shrink-0"
          aria-label="Dismiss"
        >
          ✕
        </button>
      )}
    </div>
  );
}
