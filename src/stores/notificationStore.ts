import { create } from "zustand";

export type NotificationType = "success" | "error" | "warning" | "info";

export interface Notification {
  id: string;
  type: NotificationType;
  title: string;
  message?: string;
  duration?: number; // ms, 0 = persistent
  timestamp: number;
}

interface NotificationStore {
  notifications: Notification[];
  addNotification: (n: Omit<Notification, "id" | "timestamp">) => string;
  removeNotification: (id: string) => void;
  clearAll: () => void;
}

let nextId = 0;

export const useNotificationStore = create<NotificationStore>((set) => ({
  notifications: [],

  addNotification: (n) => {
    const id = `notif-${++nextId}`;
    const notification: Notification = {
      ...n,
      id,
      timestamp: Date.now(),
      duration: n.duration ?? (n.type === "error" ? 8000 : 4000),
    };
    set((state) => ({
      notifications: [...state.notifications, notification],
    }));
    return id;
  },

  removeNotification: (id) =>
    set((state) => ({
      notifications: state.notifications.filter((n) => n.id !== id),
    })),

  clearAll: () => set({ notifications: [] }),
}));

// Convenience helpers
export const toast = {
  success: (title: string, message?: string) =>
    useNotificationStore.getState().addNotification({ type: "success", title, message }),
  error: (title: string, message?: string) =>
    useNotificationStore.getState().addNotification({ type: "error", title, message }),
  warning: (title: string, message?: string) =>
    useNotificationStore.getState().addNotification({ type: "warning", title, message }),
  info: (title: string, message?: string) =>
    useNotificationStore.getState().addNotification({ type: "info", title, message }),
};
