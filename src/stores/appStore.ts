import { create } from "zustand";
import type { ViewMode, ProtocolType } from "@/types/opcua";
import { log } from "@/services/logger";

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
  activeProtocol: "opcua",
  activeView: "connection",
  sidebarCollapsed: false,
  methodTarget: null,
  setActiveProtocol: (protocol) => set({ activeProtocol: protocol }),
  setActiveView: (view) => {
    log("debug", "action", "setActiveView", `Navigate to ${view}`);
    set({ activeView: view });
  },
  toggleSidebar: () =>
    set((state) => ({ sidebarCollapsed: !state.sidebarCollapsed })),
  setMethodTarget: (target) => set({ methodTarget: target }),
}));
