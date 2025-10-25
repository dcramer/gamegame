import clsx from 'clsx';
import { Loader2 } from 'lucide-react';
import { useTimeout } from '../../hooks/useTimeout';

export type SaveStatus = 'idle' | 'success' | 'error';

interface SaveButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  status: SaveStatus;
  isLoading?: boolean;
  successText?: string;
  errorText?: string;
  autoHideMs?: number;
  onStatusTimeout?: () => void;
  wrapperClassName?: string;
}

const DEFAULT_SUCCESS_TEXT = 'Saved.';
const DEFAULT_ERROR_TEXT = 'Save failed. Please try again.';
const DEFAULT_AUTO_HIDE = 3000;

export function SaveButton({
  status,
  isLoading = false,
  successText = DEFAULT_SUCCESS_TEXT,
  errorText = DEFAULT_ERROR_TEXT,
  autoHideMs = DEFAULT_AUTO_HIDE,
  onStatusTimeout,
  wrapperClassName,
  children,
  disabled,
  className,
  ...buttonProps
}: SaveButtonProps) {
  // Auto-hide status message after timeout
  // Only activate timeout when status is not idle and not loading
  useTimeout(
    () => {
      onStatusTimeout?.();
    },
    status !== 'idle' && !isLoading ? autoHideMs : null
  );

  const message = status === 'success' ? successText : status === 'error' ? errorText : null;

  return (
    <div className={clsx('flex flex-col gap-1', wrapperClassName)}>
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
      {message && (
        <p className={clsx('text-xs', status === 'success' ? 'text-emerald-500' : 'text-red-500')} role={status === 'success' ? 'status' : 'alert'}>
          {message}
        </p>
      )}
    </div>
  );
}
