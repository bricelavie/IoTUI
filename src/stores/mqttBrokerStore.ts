import { create } from "zustand";
import type { BrokerStats, BrokerClientInfo } from "@/types/mqtt";
import { errorMessage } from "@/utils/errors";
import * as mqtt from "@/services/mqtt";
import { getSetting } from "@/stores/settingsStore";
import { log } from "@/services/logger";

interface MqttBrokerStore {
  stats: BrokerStats | null;
  clients: BrokerClientInfo[];
  isPolling: boolean;
  error: string | null;
  lastRefreshAt: number | null;

  refreshStats: (connectionId: string) => Promise<void>;
  refreshClients: (connectionId: string) => Promise<void>;
  startPolling: (connectionId: string) => void;
  stopPolling: () => void;
  clearAll: () => void;
}

let pollTimerId: ReturnType<typeof setTimeout> | null = null;
let pollInFlight = false;

export const useMqttBrokerStore = create<MqttBrokerStore>((set, get) => ({
  stats: null,
  clients: [],
  isPolling: false,
  error: null,
  lastRefreshAt: null,

  refreshStats: async (connectionId) => {
    try {
      const stats = await mqtt.mqttGetBrokerStats(connectionId);
      set({ stats, error: null, lastRefreshAt: Date.now() });
    } catch (e) {
      set({ error: errorMessage(e) });
    }
  },

  refreshClients: async (connectionId) => {
    try {
      const clients = await mqtt.mqttGetBrokerClients(connectionId);
      set({ clients, error: null });
    } catch (e) {
      set({ error: errorMessage(e) });
    }
  },

  startPolling: (connectionId) => {
    get().stopPolling();

    const interval = getSetting("mqttBrokerStatsPollInterval");

    const runPoll = async () => {
      if (pollInFlight) return;
      pollInFlight = true;
      try {
        const [stats, clients] = await Promise.all([
          mqtt.mqttGetBrokerStats(connectionId),
          mqtt.mqttGetBrokerClients(connectionId),
        ]);
        set({ stats, clients, error: null, lastRefreshAt: Date.now() });
      } catch (e) {
        set({ error: errorMessage(e) });
        log("warn", "action", "mqtt_broker_poll", `Broker stats poll failed: ${errorMessage(e)}`);
      } finally {
        pollInFlight = false;
        if (get().isPolling) {
          pollTimerId = setTimeout(runPoll, interval);
        }
      }
    };

    set({ isPolling: true });
    void runPoll();
  },

  stopPolling: () => {
    if (pollTimerId) {
      clearTimeout(pollTimerId);
      pollTimerId = null;
    }
    pollInFlight = false;
    set({ isPolling: false });
  },

  clearAll: () => {
    get().stopPolling();
    set({
      stats: null,
      clients: [],
      isPolling: false,
      error: null,
      lastRefreshAt: null,
    });
  },
}));
