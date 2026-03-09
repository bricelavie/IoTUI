import { create } from "zustand";
import type { MqttConnectionConfig, MqttConnectionInfo } from "@/types/mqtt";
import { errorMessage } from "@/types/opcua";
import * as mqtt from "@/services/mqtt";
import { log } from "@/services/logger";

const MQTT_CONNECTION_STATE_KEY = "iotui_mqtt_connection_state_v1";

function loadPersistedState() {
  try {
    const raw = localStorage.getItem(MQTT_CONNECTION_STATE_KEY);
    if (!raw) return { activeConnectionId: null as string | null };
    const parsed = JSON.parse(raw);
    return {
      activeConnectionId:
        typeof parsed.activeConnectionId === "string" ? parsed.activeConnectionId : null,
    };
  } catch {
    return { activeConnectionId: null as string | null };
  }
}

function persistState(activeConnectionId: string | null) {
  localStorage.setItem(
    MQTT_CONNECTION_STATE_KEY,
    JSON.stringify({ activeConnectionId })
  );
}

interface MqttConnectionStore {
  connections: MqttConnectionInfo[];
  activeConnectionId: string | null;
  isConnecting: boolean;
  error: string | null;

  connect: (config: MqttConnectionConfig) => Promise<string>;
  disconnect: (id: string) => Promise<void>;
  setActiveConnection: (id: string | null) => void;
  refreshConnections: () => Promise<void>;
  refreshStatusForActiveConnection: () => Promise<void>;
  clearError: () => void;
}

export const useMqttConnectionStore = create<MqttConnectionStore>((set, get) => ({
  connections: [],
  activeConnectionId: loadPersistedState().activeConnectionId,
  isConnecting: false,
  error: null,

  connect: async (config: MqttConnectionConfig) => {
    set({ isConnecting: true, error: null });
    log("info", "connection", "mqtt_connect", `Connecting to ${config.host}:${config.port} (${config.name})`);
    try {
      const id = await mqtt.mqttConnect(config);
      const connections = await mqtt.mqttGetConnections();
      log("info", "connection", "mqtt_connect", `Connected: ${config.name} [${id}]`);
      set({
        connections,
        activeConnectionId: id,
        isConnecting: false,
      });
      persistState(id);
      return id;
    } catch (e) {
      log("error", "connection", "mqtt_connect", `Connection failed: ${errorMessage(e)}`);
      set({ error: errorMessage(e), isConnecting: false });
      throw e;
    }
  },

  disconnect: async (id: string) => {
    log("info", "connection", "mqtt_disconnect", `Disconnecting [${id}]`);
    try {
      await mqtt.mqttDisconnect(id);
      const connections = await mqtt.mqttGetConnections();
      const { activeConnectionId } = get();
      log("info", "connection", "mqtt_disconnect", `Disconnected [${id}]`);
      set({
        connections,
        activeConnectionId: activeConnectionId === id ? null : activeConnectionId,
      });
      persistState(activeConnectionId === id ? null : activeConnectionId);
    } catch (e) {
      log("error", "connection", "mqtt_disconnect", `Disconnect failed: ${errorMessage(e)}`);
      set({ error: errorMessage(e) });
    }
  },

  setActiveConnection: (id: string | null) => {
    persistState(id);
    set({ activeConnectionId: id });
  },

  refreshConnections: async () => {
    try {
      const connections = await mqtt.mqttGetConnections();
      const { activeConnectionId } = get();
      const stillExists = connections.some((conn) => conn.id === activeConnectionId);
      const nextActive = stillExists ? activeConnectionId : connections[0]?.id ?? null;
      persistState(nextActive);
      set({ connections, activeConnectionId: nextActive });
    } catch (e) {
      set({ error: errorMessage(e) });
    }
  },

  refreshStatusForActiveConnection: async () => {
    const { activeConnectionId, connections } = get();
    if (!activeConnectionId) return;
    try {
      const status = await mqtt.mqttGetConnectionStatus(activeConnectionId);
      const nextConnections = connections.map((conn) =>
        conn.id === activeConnectionId ? { ...conn, status } : conn
      );
      set({ connections: nextConnections });
    } catch (e) {
      set({ error: errorMessage(e) });
    }
  },

  clearError: () => set({ error: null }),
}));
