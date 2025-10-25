import { Spinner } from './ui/spinner';
import { Button } from './ui/button';

export interface JobStatusIndicatorProps {
  status: 'pending' | 'processing' | 'completed' | 'failed';
  progress?: number;
  currentStep?: string;
  error?: string;
  onDismiss?: () => void;
  className?: string;
}

/**
 * Reusable job status indicator component for displaying async processing status.
 * Shows spinner, progress, current step, and error states consistently.
 * Replaces repetitive job status display patterns.
 *
 * @example
 * <JobStatusIndicator
 *   status="processing"
 *   progress={45}
 *   currentStep="Extracting PDF"
 * />
 *
 * @example
 * <JobStatusIndicator
 *   status="failed"
 *   error="Failed to process PDF"
 *   onDismiss={() => clearJob(jobId)}
 * />
 */
export function JobStatusIndicator({
  status,
  progress,
  currentStep,
  error,
  onDismiss,
  className = '',
}: JobStatusIndicatorProps) {
  const isProcessing = status === 'pending' || status === 'processing';
  const isFailure = status === 'failed';
  const showFailure = isFailure || error;

  // Use currentStep or error as the message
  const messageText = currentStep || error;

  return (
    <div className={`text-xs mt-1 flex items-center gap-2 flex-wrap ${className}`}>
      {isProcessing && !showFailure && <Spinner size="sm" />}
      <span
        className={`capitalize ${showFailure ? 'text-red-500 font-semibold' : 'text-muted-foreground'}`}
      >
        {status}
      </span>
      {messageText && (
        <span className={`text-xs ${showFailure ? 'text-red-500' : 'text-muted-foreground'}`}>
          {messageText}
        </span>
      )}
      {typeof progress === 'number' && !showFailure && progress > 0 && (
        <span className="text-xs text-muted-foreground">{progress}%</span>
      )}
      {showFailure && onDismiss && (
        <Button size="sm" variant="outline" onClick={onDismiss}>
          Dismiss
        </Button>
      )}
    </div>
  );
}
