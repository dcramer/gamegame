import { useCallback } from 'react';
import { useNotifications, type NotificationType, type JobNotification } from '../contexts/NotificationContext';

/**
 * Convenience hook for creating flash notifications (toasts) and job notifications.
 * Provides simple methods for adding success/error/warning/info toasts,
 * as well as job notifications that track async processing.
 */
export function useFlashNotifications() {
  const { addNotification, updateNotification } = useNotifications();

  /**
   * Add a job notification that will poll for updates until completion.
   * @param jobId - The job ID to track
   * @param title - Short title (e.g., "Full Reprocess", "Upload Resource")
   * @param message - Optional longer description
   */
  const addJobNotification = useCallback(
    (jobId: string, title: string, message?: string) => {
      return addNotification({
        type: 'job',
        jobId,
        title,
        message: message || '',
        status: 'pending',
        persist: true,
      } as Omit<JobNotification, 'id'>);
    },
    [addNotification]
  );

  /**
   * Create a pending job notification immediately (before we have a job ID).
   * Returns the notification ID so you can update it later with the actual job ID.
   * @param title - Short title (e.g., "Full Reprocess", "Upload Resource")
   * @param message - Optional longer description
   */
  const addPendingJobNotification = useCallback(
    (title: string, message?: string) => {
      return addNotification({
        type: 'job',
        jobId: '', // Will be updated later
        title,
        message: message || '',
        status: 'queued',
        persist: true,
      } as Omit<JobNotification, 'id'>);
    },
    [addNotification]
  );

  /**
   * Update a pending job notification with the actual job ID.
   * This starts the polling process.
   */
  const updatePendingJobWithId = useCallback(
    (notificationId: string, jobId: string) => {
      updateNotification(notificationId, {
        jobId,
        status: 'pending',
      } as Partial<JobNotification>);
    },
    [updateNotification]
  );

  /**
   * Add a simple toast notification (auto-dismisses after timeout).
   */
  const addToast = useCallback(
    (type: Exclude<NotificationType, 'job'>, message: string, autoHideMs?: number) => {
      return addNotification({
        type,
        message,
        autoHideMs,
      });
    },
    [addNotification]
  );

  return {
    addJobNotification,
    addPendingJobNotification,
    updatePendingJobWithId,
    addToast,
  };
}
