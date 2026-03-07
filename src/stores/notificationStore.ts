import { create } from "zustand";
import { getSetting } from "@/stores/settingsStore";

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
const MAX_NOTIFICATIONS = 100;
const DEDUP_WINDOW_MS = 2_000;

export const useNotificationStore = create<NotificationStore>((set) => ({
  notifications: [],

  addNotification: (n) => {
    const id = `notif-${++nextId}`;
    const now = Date.now();
    const notification: Notification = {
      ...n,
      id,
      timestamp: now,
      duration: n.duration ?? (n.type === "error" ? getSetting("errorToastDuration") : getSetting("normalToastDuration")),
    };
    set((state) => {
      // Deduplicate: skip if an identical title+message+type exists within the window
      const isDuplicate = state.notifications.some(
        (existing) =>
          existing.type === n.type &&
          existing.title === n.title &&
          existing.message === n.message &&
          now - existing.timestamp < DEDUP_WINDOW_MS
      );
      if (isDuplicate) return state;

      const updated = [...state.notifications, notification];
      // Cap at MAX_NOTIFICATIONS, dropping oldest first
      return {
        notifications: updated.length > MAX_NOTIFICATIONS
          ? updated.slice(updated.length - MAX_NOTIFICATIONS)
          : updated,
      };
    });
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
