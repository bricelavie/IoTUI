import { create } from "zustand";
import type { ViewMode, ProtocolType } from "@/types/opcua";
import { log } from "@/services/logger";

const APP_STATE_KEY = "iotui_app_state_v1";

interface MethodTarget {
  methodNodeId: string;
  objectNodeId?: string;
}

interface AppStore {
  activeProtocol: ProtocolType;
  activeView: ViewMode;
  sidebarCollapsed: boolean;
  methodTarget: MethodTarget | null;
  setActiveProtocol: (protocol: ProtocolType) => void;
  setActiveView: (view: ViewMode) => void;
  toggleSidebar: () => void;
  setMethodTarget: (target: MethodTarget | null) => void;
}

export const useAppStore = create<AppStore>((set) => ({
  ...(() => {
    try {
      const saved = localStorage.getItem(APP_STATE_KEY);
      const parsed = saved ? JSON.parse(saved) : {};
      return {
        activeProtocol: parsed.activeProtocol ?? "opcua",
        activeView: parsed.activeView ?? "connection",
        sidebarCollapsed: parsed.sidebarCollapsed ?? false,
      };
    } catch {
      return {
        activeProtocol: "opcua",
        activeView: "connection",
        sidebarCollapsed: false,
      };
    }
  })(),
  methodTarget: null,
  setActiveProtocol: (protocol) =>
    set((state) => {
      localStorage.setItem(
        APP_STATE_KEY,
        JSON.stringify({
          activeProtocol: protocol,
          activeView: state.activeView,
          sidebarCollapsed: state.sidebarCollapsed,
        })
      );
      return { activeProtocol: protocol };
    }),
  setActiveView: (view) => {
    log("debug", "action", "setActiveView", `Navigate to ${view}`);
    set((state) => {
      localStorage.setItem(
        APP_STATE_KEY,
        JSON.stringify({
          activeProtocol: state.activeProtocol,
          activeView: view,
          sidebarCollapsed: state.sidebarCollapsed,
        })
      );
      return { activeView: view };
    });
  },
  toggleSidebar: () =>
    set((state) => {
      const next = !state.sidebarCollapsed;
      localStorage.setItem(
        APP_STATE_KEY,
        JSON.stringify({
          activeProtocol: state.activeProtocol,
          activeView: state.activeView,
          sidebarCollapsed: next,
        })
      );
      return { sidebarCollapsed: next };
    }),
  setMethodTarget: (target) => set({ methodTarget: target }),
}));
