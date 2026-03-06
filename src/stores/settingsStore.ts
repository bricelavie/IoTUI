import { create } from "zustand";

export interface AppSettings {
  // ─── Data & Subscriptions ────────────────────────────────────
  /** Max data points retained per monitored node */
  maxHistoryPoints: number;
  /** Default publishing interval (ms) for new subscriptions */
  defaultPublishingInterval: number;
  /** Default sampling interval (ms) for new monitored items */
  defaultSamplingInterval: number;
  /** Default queue size for new monitored items */
  defaultQueueSize: number;

  // ─── Logging ─────────────────────────────────────────────────
  /** Max log entries in the frontend log panel */
  maxLogEntries: number;
  /** Backend log poll interval (ms) */
  backendLogPollInterval: number;
  /** Log high-frequency IPC poll commands (pollSubscription, pollEvents) */
  logIpcPolling: boolean;
  /** Max characters for IPC result details in logs */
  ipcResultTruncation: number;

  // ─── Events ──────────────────────────────────────────────────
  /** Max events retained in the event viewer */
  maxEventEntries: number;
  /** Event viewer poll interval (ms) */
  eventPollInterval: number;

  // ─── Notifications ───────────────────────────────────────────
  /** Error toast duration (ms) */
  errorToastDuration: number;
  /** Normal toast duration (ms) */
  normalToastDuration: number;
}

interface SettingsStore extends AppSettings {
  // Actions
  update: (partial: Partial<AppSettings>) => void;
  reset: () => void;
}

const DEFAULTS: AppSettings = {
  maxHistoryPoints: 100,
  defaultPublishingInterval: 500,
  defaultSamplingInterval: 500,
  defaultQueueSize: 10,

  maxLogEntries: 2000,
  backendLogPollInterval: 2000,
  logIpcPolling: false,
  ipcResultTruncation: 500,

  maxEventEntries: 500,
  eventPollInterval: 3000,

  errorToastDuration: 8000,
  normalToastDuration: 4000,
};

export const useSettingsStore = create<SettingsStore>((set) => ({
  ...DEFAULTS,

  update: (partial) => set(partial),
  reset: () => set(DEFAULTS),
}));

/** Read a setting value outside of React (in stores, services, etc.) */
export function getSetting<K extends keyof AppSettings>(key: K): AppSettings[K] {
  return useSettingsStore.getState()[key];
}
