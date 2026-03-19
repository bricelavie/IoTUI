import { create } from "zustand";

const SETTINGS_KEY = "iotui_settings_v1";

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

  // ─── MQTT ────────────────────────────────────────────────────
  /** Default QoS for MQTT subscriptions (0, 1, 2) */
  mqttDefaultQoS: number;
  /** MQTT message poll interval (ms) */
  mqttPollInterval: number;
  /** Max MQTT messages retained per topic in the topic store */
  mqttMaxMessagesPerTopic: number;
  /** Max total MQTT messages in the message stream */
  mqttMaxStreamMessages: number;
  /** MQTT broker stats poll interval (ms) */
  mqttBrokerStatsPollInterval: number;

  // ─── Modbus ──────────────────────────────────────────────────
  /** Modbus monitor poll interval (ms) */
  modbusPollInterval: number;
  /** Per-request timeout for Modbus operations (ms) */
  modbusRequestTimeout: number;
  /** Default Modbus slave/unit ID */
  modbusDefaultUnitId: number;
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

  mqttDefaultQoS: 0,
  mqttPollInterval: 500,
  mqttMaxMessagesPerTopic: 100,
  mqttMaxStreamMessages: 1000,
  mqttBrokerStatsPollInterval: 3000,

  modbusPollInterval: 1000,
  modbusRequestTimeout: 3000,
  modbusDefaultUnitId: 1,
};

const SETTINGS_KEYS = Object.keys(DEFAULTS) as (keyof AppSettings)[];

function pickSettings(state: SettingsStore): AppSettings {
  return Object.fromEntries(
    SETTINGS_KEYS.map((k) => [k, state[k]])
  ) as unknown as AppSettings;
}

export const useSettingsStore = create<SettingsStore>((set) => ({
  ...DEFAULTS,
  ...(() => {
    try {
      const stored = localStorage.getItem(SETTINGS_KEY);
      return stored ? { ...DEFAULTS, ...JSON.parse(stored) } : DEFAULTS;
    } catch {
      return DEFAULTS;
    }
  })(),

  update: (partial) =>
    set((state) => {
      const next = { ...state, ...partial };
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(pickSettings(next)));
      return partial;
    }),
  reset: () => {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(DEFAULTS));
    set(DEFAULTS);
  },
}));

/** Read a setting value outside of React (in stores, services, etc.) */
export function getSetting<K extends keyof AppSettings>(key: K): AppSettings[K] {
  return useSettingsStore.getState()[key];
}
