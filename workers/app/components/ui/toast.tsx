import { useEffect } from 'react';
import clsx from 'clsx';

export type ToastVariant = 'success' | 'error' | 'warning' | 'info';

interface ToastProps {
  variant: ToastVariant;
  message: string;
  onDismiss?: () => void;
  autoHideMs?: number;
}

const variantStyles = {
  success: 'bg-green-600/90 text-white',
  error: 'bg-destructive/90 text-destructive-foreground',
  warning: 'bg-yellow-600/90 text-white',
  info: 'bg-blue-600/90 text-white',
};

/**
 * Toast notification that appears at the top right of the viewport
 * without affecting the page layout. Auto-dismisses after a timeout.
 */
export function Toast({ variant, message, onDismiss, autoHideMs = 5000 }: ToastProps) {
  useEffect(() => {
    if (autoHideMs && onDismiss) {
      const timer = setTimeout(onDismiss, autoHideMs);
      return () => clearTimeout(timer);
    }
  }, [autoHideMs, onDismiss]);

  return (
    <div className="fixed top-4 right-4 z-50 animate-in fade-in slide-in-from-right-2 duration-300">
      <div
        className={clsx(
          'flex items-center gap-3 px-4 py-3 rounded-lg shadow-lg font-medium max-w-md overflow-hidden',
          variantStyles[variant]
        )}
        role="alert"
      >
        <span className="flex-1">{message}</span>
        {onDismiss && (
          <button
            onClick={onDismiss}
            className="hover:opacity-70 transition-opacity shrink-0 ml-2"
            aria-label="Dismiss"
          >
            ✕
          </button>
        )}
      </div>
    </div>
  );
}
