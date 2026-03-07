import { create } from "zustand";
import type {
  ConnectionConfig,
  ConnectionInfo,
  EndpointInfo,
} from "@/types/opcua";
import { errorMessage } from "@/types/opcua";
import * as opcua from "@/services/opcua";
import { log } from "@/services/logger";

const CONNECTION_STATE_KEY = "iotui_connection_state_v1";

function loadPersistedConnectionState() {
  try {
    const raw = localStorage.getItem(CONNECTION_STATE_KEY);
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

function persistConnectionState(activeConnectionId: string | null) {
  localStorage.setItem(
    CONNECTION_STATE_KEY,
    JSON.stringify({ activeConnectionId })
  );
}

interface ConnectionStore {
  // State
  connections: ConnectionInfo[];
  activeConnectionId: string | null;
  endpoints: EndpointInfo[];
  isConnecting: boolean;
  isDiscovering: boolean;
  error: string | null;

  // Actions
  discover: (url: string) => Promise<void>;
  connect: (config: ConnectionConfig) => Promise<string>;
  disconnect: (id: string) => Promise<void>;
  setActiveConnection: (id: string | null) => void;
  refreshConnections: () => Promise<void>;
  refreshStatusForActiveConnection: () => Promise<void>;
  clearError: () => void;
}

export const useConnectionStore = create<ConnectionStore>((set, get) => ({
  connections: [],
  activeConnectionId: loadPersistedConnectionState().activeConnectionId,
  endpoints: [],
  isConnecting: false,
  isDiscovering: false,
  error: null,

  discover: async (url: string) => {
    set({ isDiscovering: true, error: null, endpoints: [] });
    try {
      const endpoints = await opcua.discoverEndpoints(url);
      set({ endpoints, isDiscovering: false });
    } catch (e) {
      set({ error: errorMessage(e), isDiscovering: false });
      throw e;
    }
  },

  connect: async (config: ConnectionConfig) => {
    set({ isConnecting: true, error: null });
    log("info", "connection", "connect", `Connecting to ${config.endpoint_url} (${config.name})`);
    try {
      const id = await opcua.connect(config);
      const connections = await opcua.getConnections();
      log("info", "connection", "connect", `Connected: ${config.name} [${id}]`);
      set({
        connections,
        activeConnectionId: id,
        isConnecting: false,
      });
      persistConnectionState(id);
      return id;
    } catch (e) {
      log("error", "connection", "connect", `Connection failed: ${errorMessage(e)}`);
      set({ error: errorMessage(e), isConnecting: false });
      throw e;
    }
  },

  disconnect: async (id: string) => {
    log("info", "connection", "disconnect", `Disconnecting [${id}]`);
    try {
      await opcua.disconnect(id);
      const connections = await opcua.getConnections();
      const { activeConnectionId } = get();
      log("info", "connection", "disconnect", `Disconnected [${id}]`);
      set({
        connections,
        activeConnectionId: activeConnectionId === id ? null : activeConnectionId,
      });
      persistConnectionState(activeConnectionId === id ? null : activeConnectionId);
    } catch (e) {
      log("error", "connection", "disconnect", `Disconnect failed: ${errorMessage(e)}`);
      set({ error: errorMessage(e) });
    }
  },

  setActiveConnection: (id: string | null) => {
    persistConnectionState(id);
    set({ activeConnectionId: id });
  },

  refreshConnections: async () => {
    try {
      const connections = await opcua.getConnections();
      const { activeConnectionId } = get();
      const stillExists = connections.some((conn) => conn.id === activeConnectionId);
      const nextActive = stillExists ? activeConnectionId : connections[0]?.id ?? null;
      persistConnectionState(nextActive);
      set({ connections, activeConnectionId: nextActive });
    } catch (e) {
      set({ error: errorMessage(e) });
    }
  },

  refreshStatusForActiveConnection: async () => {
    const { activeConnectionId, connections } = get();
    if (!activeConnectionId) return;
    try {
      const status = await opcua.getConnectionStatus(activeConnectionId);
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
