import React, { useEffect } from "react";
import { AppShell } from "@/components/layout/AppShell";
import { Sidebar } from "@/components/layout/Sidebar";
import { Header } from "@/components/layout/Header";
import { StatusBar } from "@/components/layout/StatusBar";
import { ToastContainer } from "@/components/ui/Toast";
import { ConnectionPanel } from "@/components/opcua/ConnectionPanel";
import { AddressSpaceTree } from "@/components/opcua/AddressSpaceTree";
import { NodeAttributePanel } from "@/components/opcua/NodeAttributePanel";
import { SubscriptionManager } from "@/components/opcua/SubscriptionManager";
import { MonitoredItemsTable } from "@/components/opcua/MonitoredItemsTable";
import { MethodCaller } from "@/components/opcua/MethodCaller";
import { DataExport } from "@/components/opcua/DataExport";
import { Dashboard } from "@/components/opcua/Dashboard";
import { EventViewer } from "@/components/opcua/EventViewer";
import { useAppStore } from "@/stores/appStore";
import { useConnectionStore } from "@/stores/connectionStore";
import type { ViewMode } from "@/types/opcua";

function MainContent() {
  const { activeView } = useAppStore();
  const { activeConnectionId } = useConnectionStore();

  if (activeView === "connection") {
    return <ConnectionPanel />;
  }

  if (!activeConnectionId) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center">
          <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-iot-bg-elevated border border-iot-border flex items-center justify-center">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-iot-text-disabled">
              <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" />
            </svg>
          </div>
          <p className="text-sm text-iot-text-secondary font-medium">No Active Connection</p>
          <p className="text-xs text-iot-text-muted mt-1">Connect to an OPC UA server to get started</p>
        </div>
      </div>
    );
  }

  switch (activeView) {
    case "browse":
      return (
        <div className="flex h-full">
          <div className="w-80 border-r border-iot-border flex-shrink-0">
            <AddressSpaceTree />
          </div>
          <div className="flex-1 min-w-0">
            <NodeAttributePanel />
          </div>
        </div>
      );
    case "attributes":
      return <NodeAttributePanel />;
    case "subscriptions":
      return (
        <div className="flex flex-col h-full">
          <div className="flex-shrink-0 border-b border-iot-border">
            <SubscriptionManager />
          </div>
          <div className="flex-1 min-h-0">
            <MonitoredItemsTable />
          </div>
        </div>
      );
    case "dashboard":
      return <Dashboard />;
    case "events":
      return <EventViewer />;
    case "methods":
      return <MethodCaller />;
    case "export":
      return <DataExport />;
    default:
      return <ConnectionPanel />;
  }
}

export default function App() {
  const setActiveView = useAppStore((s) => s.setActiveView);
  const disconnect = useConnectionStore((s) => s.disconnect);
  const activeConnectionId = useConnectionStore((s) => s.activeConnectionId);

  // Global keyboard shortcuts
  useEffect(() => {
    const viewShortcuts: Record<string, ViewMode> = {
      "1": "connection",
      "2": "browse",
      "3": "subscriptions",
      "4": "dashboard",
      "5": "events",
      "6": "methods",
      "7": "export",
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey;

      // Ctrl/Cmd+1-8 for view navigation
      if (mod && viewShortcuts[e.key]) {
        e.preventDefault();
        setActiveView(viewShortcuts[e.key]);
        return;
      }

      // Ctrl/Cmd+D to disconnect
      if (mod && e.key === "d") {
        e.preventDefault();
        if (activeConnectionId) {
          disconnect(activeConnectionId);
        }
        return;
      }

      // Escape to close modals (handled by modal components, but also resets focus)
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [setActiveView, disconnect, activeConnectionId]);

  return (
    <AppShell>
      <div className="flex flex-col h-full">
        <div className="flex flex-1 min-h-0">
          <Sidebar />
          <div className="flex flex-col flex-1 min-w-0">
            <Header />
            <main className="flex-1 min-h-0 overflow-hidden">
              <MainContent />
            </main>
          </div>
        </div>
        <StatusBar />
      </div>
      <ToastContainer />
    </AppShell>
  );
}
