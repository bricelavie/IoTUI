import { create } from "zustand";
import type { ViewMode, ProtocolType } from "@/types/opcua";

interface AppStore {
  activeProtocol: ProtocolType;
  activeView: ViewMode;
  sidebarCollapsed: boolean;
  setActiveProtocol: (protocol: ProtocolType) => void;
  setActiveView: (view: ViewMode) => void;
  toggleSidebar: () => void;
}

export const useAppStore = create<AppStore>((set) => ({
  activeProtocol: "opcua",
  activeView: "connection",
  sidebarCollapsed: false,
  setActiveProtocol: (protocol) => set({ activeProtocol: protocol }),
  setActiveView: (view) => set({ activeView: view }),
  toggleSidebar: () =>
    set((state) => ({ sidebarCollapsed: !state.sidebarCollapsed })),
}));
