import { create } from "zustand";
import type { ViewMode, ProtocolType } from "@/types/opcua";
import { log } from "@/services/logger";

const APP_STATE_KEY = "iotui_app_state_v1";

interface MethodTarget {
  methodNodeId: string;
  objectNodeId?: string;
}

interface PersistedState {
  activeProtocol: ProtocolType;
  activeView: ViewMode;
  sidebarCollapsed: boolean;
}

function loadPersistedAppState(): PersistedState {
  try {
    const saved = localStorage.getItem(APP_STATE_KEY);
    const parsed = saved ? JSON.parse(saved) : {};
    return {
      activeProtocol: parsed.activeProtocol ?? "opcua",
      activeView: parsed.activeView ?? "connection",
      sidebarCollapsed: parsed.sidebarCollapsed ?? false,
    };
  } catch {
    return { activeProtocol: "opcua", activeView: "connection", sidebarCollapsed: false };
  }
}

function persistAppState(state: PersistedState) {
  localStorage.setItem(APP_STATE_KEY, JSON.stringify(state));
}

interface AppStore extends PersistedState {
  methodTarget: MethodTarget | null;
  setActiveProtocol: (protocol: ProtocolType) => void;
  setActiveView: (view: ViewMode) => void;
  toggleSidebar: () => void;
  setMethodTarget: (target: MethodTarget | null) => void;
}

export const useAppStore = create<AppStore>((set) => ({
  ...loadPersistedAppState(),
  methodTarget: null,
  setActiveProtocol: (protocol) =>
    set((state) => {
      const next = { ...state, activeProtocol: protocol };
      persistAppState(next);
      return { activeProtocol: protocol };
    }),
  setActiveView: (view) => {
    log("debug", "action", "setActiveView", `Navigate to ${view}`);
    set((state) => {
      const next = { ...state, activeView: view };
      persistAppState(next);
      return { activeView: view };
    });
  },
  toggleSidebar: () =>
    set((state) => {
      const sidebarCollapsed = !state.sidebarCollapsed;
      const next = { ...state, sidebarCollapsed };
      persistAppState(next);
      return { sidebarCollapsed };
    }),
  setMethodTarget: (target) => set({ methodTarget: target }),
}));
