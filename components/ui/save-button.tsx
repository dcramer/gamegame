'use client';

import clsx from 'clsx';
import { Loader2 } from 'lucide-react';
import { useTimeout } from '@/hooks/useTimeout';

export type SaveStatus = 'idle' | 'success' | 'error';

interface SaveButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  status: SaveStatus;
  isLoading?: boolean;
  autoHideMs?: number;
  onStatusTimeout?: () => void;
}

const DEFAULT_AUTO_HIDE = 3000;

/**
 * A save button that shows a loading spinner while saving.
 * The status prop is used to trigger the onStatusTimeout callback after autoHideMs.
 * This is useful for resetting the status state after showing a flash notification.
 */
export function SaveButton({
  status,
  isLoading = false,
  autoHideMs = DEFAULT_AUTO_HIDE,
  onStatusTimeout,
  children,
  disabled,
  className,
  ...buttonProps
}: SaveButtonProps) {
  // Auto-hide status after timeout - useful for resetting status state
  // Only activate timeout when status is not idle and not loading
  useTimeout(
    () => {
      onStatusTimeout?.();
    },
    status !== 'idle' && !isLoading ? autoHideMs : null
  );

  return (
    <button
      {...buttonProps}
      disabled={isLoading || disabled}
      className={clsx(
        'inline-flex items-center justify-center gap-2 rounded bg-primary px-3 py-2 text-sm font-medium text-primary-foreground transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-70',
        className
      )}
    >
      {isLoading && <Loader2 className="h-4 w-4 animate-spin" />}
      <span>{children ?? 'Save Changes'}</span>
    </button>
  );
}
