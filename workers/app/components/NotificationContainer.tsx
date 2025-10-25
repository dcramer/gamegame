import { useNotifications, type Notification, type JobNotification } from '../contexts/NotificationContext';
import clsx from 'clsx';
import { useEffect } from 'react';
import { apiClient } from '../../load-context';

const variantStyles = {
  success: 'bg-green-600/90 text-white',
  error: 'bg-destructive/90 text-destructive-foreground',
  warning: 'bg-yellow-600/90 text-white',
  info: 'bg-blue-600/90 text-white',
  job: 'bg-blue-600/90 text-white',
};

function NotificationItem({ notification }: { notification: Notification }) {
  const { removeNotification, updateNotification } = useNotifications();

  // Poll job status for job notifications
  useEffect(() => {
    if (notification.type !== 'job') return;

    const jobNotification = notification as JobNotification;

    // Auto-remove completed/failed jobs after 5 seconds
    if (jobNotification.status === 'completed' || jobNotification.status === 'failed') {
      const timer = setTimeout(() => {
        removeNotification(notification.id);
      }, 5000);
      return () => clearTimeout(timer);
    }

    // Don't poll if we don't have a job ID yet (queued state before API response)
    if (!jobNotification.jobId || jobNotification.jobId === '') {
      return;
    }

    // Poll every 2 seconds for active jobs
    const interval = setInterval(async () => {
      try {
        const response = await apiClient.fetch(`/resources/jobs/${jobNotification.jobId}`);
        if (!response.ok) {
          throw new Error('Failed to fetch job status');
        }

        const data = (await response.json()) as {
          status: JobNotification['status'];
          progress?: number;
          currentStep?: string;
          error?: string;
        };
        updateNotification(notification.id, {
          status: data.status,
          progress: data.progress,
          currentStep: data.currentStep,
          error: data.error,
        } as Partial<JobNotification>);
      } catch (error) {
        console.error('Failed to poll job status:', error);
        updateNotification(notification.id, {
          status: 'failed',
          error: 'Failed to fetch job status',
        } as Partial<JobNotification>);
      }
    }, 2000);

    return () => clearInterval(interval);
  }, [notification, updateNotification, removeNotification]);

  const handleDismiss = () => {
    removeNotification(notification.id);
  };

  // Determine background color based on job status for job notifications
  let bgColor = variantStyles[notification.type];
  if (notification.type === 'job') {
    const jobNotification = notification as JobNotification;
    if (jobNotification.status === 'completed') {
      bgColor = variantStyles.success;
    } else if (jobNotification.status === 'failed') {
      bgColor = variantStyles.error;
    }
  }

  return (
    <div className="animate-in fade-in slide-in-from-right-2 duration-300 mb-2">
      <div
        className={clsx(
          'flex items-center gap-3 px-4 py-3 rounded-lg shadow-lg font-medium max-w-md overflow-hidden',
          bgColor
        )}
        role="alert"
      >
        <div className="flex-1">
          {notification.type === 'job' ? (
            (() => {
              const jobNotification = notification as JobNotification;
              return (
                <div className="space-y-1">
                  <div className="font-semibold">{jobNotification.title}</div>
                  {notification.message && (
                    <div className="text-sm opacity-90">{notification.message}</div>
                  )}
                  {jobNotification.currentStep && (
                    <div className="text-xs opacity-75 mt-1">{jobNotification.currentStep}</div>
                  )}
                  {jobNotification.progress !== undefined && jobNotification.progress > 0 && (
                    <div className="flex items-center gap-2 text-sm">
                      <div className="flex-1 bg-white/20 rounded-full h-2 overflow-hidden">
                        <div
                          className="bg-white h-full transition-all duration-300"
                          style={{ width: `${jobNotification.progress}%` }}
                        />
                      </div>
                      <span className="opacity-90">{Math.round(jobNotification.progress)}%</span>
                    </div>
                  )}
                  {jobNotification.error && <div className="text-sm mt-1">{jobNotification.error}</div>}
                </div>
              );
            })()
          ) : (
            <span>{notification.message}</span>
          )}
        </div>
        <button
          onClick={handleDismiss}
          className="hover:opacity-70 transition-opacity shrink-0 ml-2 text-lg leading-none"
          aria-label="Dismiss"
        >
          ✕
        </button>
      </div>
    </div>
  );
}

/**
 * Container that displays all active notifications in the top right corner.
 * Notifications are stacked vertically with the newest at the top.
 */
export function NotificationContainer() {
  const { notifications } = useNotifications();

  if (notifications.length === 0) return null;

  return (
    <div className="fixed top-4 right-4 z-50 flex flex-col-reverse max-w-md">
      {notifications.map((notification) => (
        <NotificationItem key={notification.id} notification={notification} />
      ))}
    </div>
  );
}
