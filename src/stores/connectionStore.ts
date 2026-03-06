import { create } from "zustand";
import type {
  ConnectionConfig,
  ConnectionInfo,
  ConnectionStatus,
  EndpointInfo,
} from "@/types/opcua";
import * as opcua from "@/services/opcua";

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
  clearError: () => void;
}

export const useConnectionStore = create<ConnectionStore>((set, get) => ({
  connections: [],
  activeConnectionId: null,
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
      set({ error: String(e), isDiscovering: false });
    }
  },

  connect: async (config: ConnectionConfig) => {
    set({ isConnecting: true, error: null });
    try {
      const id = await opcua.connect(config);
      const connections = await opcua.getConnections();
      set({
        connections,
        activeConnectionId: id,
        isConnecting: false,
      });
      return id;
    } catch (e) {
      set({ error: String(e), isConnecting: false });
      throw e;
    }
  },

  disconnect: async (id: string) => {
    try {
      await opcua.disconnect(id);
      const connections = await opcua.getConnections();
      const { activeConnectionId } = get();
      set({
        connections,
        activeConnectionId: activeConnectionId === id ? null : activeConnectionId,
      });
    } catch (e) {
      set({ error: String(e) });
    }
  },

  setActiveConnection: (id: string | null) => {
    set({ activeConnectionId: id });
  },

  refreshConnections: async () => {
    try {
      const connections = await opcua.getConnections();
      set({ connections });
    } catch (e) {
      set({ error: String(e) });
    }
  },

  clearError: () => set({ error: null }),
}));
