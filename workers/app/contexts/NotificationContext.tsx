import { createContext, useContext, useState, useCallback, type ReactNode } from 'react';

export type NotificationType = 'success' | 'error' | 'warning' | 'info' | 'job';

export interface BaseNotification {
  id: string;
  type: NotificationType;
  message: string;
  persist?: boolean;
  autoHideMs?: number;
}

export interface JobNotification extends BaseNotification {
  type: 'job';
  jobId: string;
  title: string; // Short title (e.g., "Full Reprocess")
  status: 'queued' | 'pending' | 'processing' | 'completed' | 'failed';
  progress?: number;
  currentStep?: string;
  error?: string;
}

export type Notification = BaseNotification | JobNotification;

interface NotificationContextValue {
  notifications: Notification[];
  addNotification: (notification: Omit<Notification, 'id'>) => string;
  updateNotification: (id: string, updates: Partial<Notification>) => void;
  removeNotification: (id: string) => void;
  clearAll: () => void;
}

const NotificationContext = createContext<NotificationContextValue | undefined>(undefined);

export function NotificationProvider({ children }: { children: ReactNode }) {
  const [notifications, setNotifications] = useState<Notification[]>([]);

  const addNotification = useCallback((notification: Omit<Notification, 'id'>) => {
    // Deduplicate job notifications by jobId
    if (notification.type === 'job') {
      const jobNotif = notification as Omit<JobNotification, 'id'>;

      // Check if a notification already exists for this job ID
      const existingNotification = notifications.find(
        (n): n is JobNotification =>
          n.type === 'job' &&
          n.jobId === jobNotif.jobId &&
          jobNotif.jobId !== '' // Don't dedupe pending notifications without jobId yet
      );

      if (existingNotification) {
        console.log('[NotificationContext] Skipping duplicate job notification:', jobNotif.jobId);
        return existingNotification.id;
      }
    }

    const id = `notification-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
    const newNotification: Notification = { ...notification, id } as Notification;

    setNotifications((prev) => [...prev, newNotification]);

    // Auto-hide non-persistent notifications
    if (!notification.persist && notification.type !== 'job') {
      const hideMs = notification.autoHideMs ?? 5000;
      setTimeout(() => {
        removeNotification(id);
      }, hideMs);
    }

    return id;
  }, [notifications]);

  const updateNotification = useCallback((id: string, updates: Partial<Notification>) => {
    setNotifications((prev) =>
      prev.map((notification) =>
        notification.id === id ? { ...notification, ...updates } : notification
      )
    );
  }, []);

  const removeNotification = useCallback((id: string) => {
    setNotifications((prev) => prev.filter((notification) => notification.id !== id));
  }, []);

  const clearAll = useCallback(() => {
    setNotifications([]);
  }, []);

  return (
    <NotificationContext.Provider
      value={{ notifications, addNotification, updateNotification, removeNotification, clearAll }}
    >
      {children}
    </NotificationContext.Provider>
  );
}

export function useNotifications() {
  const context = useContext(NotificationContext);
  if (!context) {
    throw new Error('useNotifications must be used within a NotificationProvider');
  }
  return context;
}
