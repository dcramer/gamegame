'use client';

import clsx from 'clsx';
import { Loader2 } from 'lucide-react';
import { useTimeout } from '@/hooks/useTimeout';

/**
 * Status of the save operation.
 * - 'idle': Default state, no save operation in progress or completed
 * - 'success': Save completed successfully
 * - 'error': Save failed with an error
 *
 * Note: Loading state is managed separately via the `isLoading` prop.
 */
export type SaveStatus = 'idle' | 'success' | 'error';

interface SaveButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  /**
   * Current status of the save operation.
   * Used to trigger auto-hide timeout after showing success/error state.
   */
  status: SaveStatus;
  /**
   * Whether the save operation is currently in progress.
   * Shows a loading spinner and disables the button when true.
   * Kept separate from status to allow showing loading state without auto-hide timeout.
   */
  isLoading?: boolean;
  /**
   * Time in milliseconds before calling onStatusTimeout.
   * Only applies when status is 'success' or 'error'.
   * @default 3000
   */
  autoHideMs?: number;
  /**
   * Callback fired after autoHideMs when status is 'success' or 'error'.
   * Useful for resetting status back to 'idle'.
   */
  onStatusTimeout?: () => void;
}

const DEFAULT_AUTO_HIDE = 3000;

/**
 * A save button that shows loading state and handles status timeout.
 *
 * @example
 * ```tsx
 * const [status, setStatus] = useState<SaveStatus>('idle');
 * const [isLoading, setIsLoading] = useState(false);
 *
 * const handleSave = async () => {
 *   setIsLoading(true);
 *   try {
 *     await saveData();
 *     setStatus('success');
 *   } catch (error) {
 *     setStatus('error');
 *   } finally {
 *     setIsLoading(false);
 *   }
 * };
 *
 * <SaveButton
 *   status={status}
 *   isLoading={isLoading}
 *   onStatusTimeout={() => setStatus('idle')}
 *   onClick={handleSave}
 * >
 *   Save Changes
 * </SaveButton>
 * ```
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
