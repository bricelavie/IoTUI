import { create } from "zustand";
import type { ModbusConnectionConfig, ModbusConnectionInfo } from "@/types/modbus";
import { errorMessage } from "@/utils/errors";
import * as modbus from "@/services/modbus";
import { log } from "@/services/logger";

const MODBUS_CONNECTION_STATE_KEY = "iotui_modbus_connection_state_v1";

function loadPersistedState() {
  try {
    const raw = localStorage.getItem(MODBUS_CONNECTION_STATE_KEY);
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
    MODBUS_CONNECTION_STATE_KEY,
    JSON.stringify({ activeConnectionId })
  );
}

interface ModbusConnectionStore {
  connections: ModbusConnectionInfo[];
  activeConnectionId: string | null;
  isConnecting: boolean;
  error: string | null;

  connect: (config: ModbusConnectionConfig) => Promise<string>;
  disconnect: (id: string) => Promise<void>;
  setActiveConnection: (id: string | null) => void;
  refreshConnections: () => Promise<void>;
  refreshStatusForActiveConnection: () => Promise<void>;
  clearError: () => void;
}

export const useModbusConnectionStore = create<ModbusConnectionStore>((set, get) => ({
  connections: [],
  activeConnectionId: loadPersistedState().activeConnectionId,
  isConnecting: false,
  error: null,

  connect: async (config: ModbusConnectionConfig) => {
    set({ isConnecting: true, error: null });
    log("info", "connection", "modbus_connect", `Connecting to ${config.host}:${config.port} (${config.name})`);
    try {
      const id = await modbus.modbusConnect(config);
      const connections = await modbus.modbusGetConnections();
      log("info", "connection", "modbus_connect", `Connected: ${config.name} [${id}]`);
      set({
        connections,
        activeConnectionId: id,
        isConnecting: false,
      });
      persistState(id);
      return id;
    } catch (e) {
      log("error", "connection", "modbus_connect", `Connection failed: ${errorMessage(e)}`);
      set({ error: errorMessage(e), isConnecting: false });
      throw e;
    }
  },

  disconnect: async (id: string) => {
    log("info", "connection", "modbus_disconnect", `Disconnecting [${id}]`);
    try {
      await modbus.modbusDisconnect(id);
      const connections = await modbus.modbusGetConnections();
      const { activeConnectionId } = get();
      log("info", "connection", "modbus_disconnect", `Disconnected [${id}]`);
      set({
        connections,
        activeConnectionId: activeConnectionId === id ? null : activeConnectionId,
      });
      persistState(activeConnectionId === id ? null : activeConnectionId);
    } catch (e) {
      log("error", "connection", "modbus_disconnect", `Disconnect failed: ${errorMessage(e)}`);
      set({ error: errorMessage(e) });
    }
  },

  setActiveConnection: (id: string | null) => {
    persistState(id);
    set({ activeConnectionId: id });
  },

  refreshConnections: async () => {
    try {
      const connections = await modbus.modbusGetConnections();
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
      const status = await modbus.modbusGetConnectionStatus(activeConnectionId);
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
