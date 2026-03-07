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
import { LogPanel } from "@/components/opcua/LogPanel";
import { SettingsPanel } from "@/components/opcua/SettingsPanel";
import { useAppStore } from "@/stores/appStore";
import { useConnectionStore } from "@/stores/connectionStore";
import { useSubscriptionStore } from "@/stores/subscriptionStore";
import { startBackendLogPolling, stopBackendLogPolling } from "@/services/logger";
import type { ViewMode } from "@/types/opcua";

// ─── Error Boundary ──────────────────────────────────────────────

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
  errorInfo: React.ErrorInfo | null;
}

class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  ErrorBoundaryState
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, error: null, errorInfo: null };
  }

  static getDerivedStateFromError(error: Error): Partial<ErrorBoundaryState> {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    this.setState({ errorInfo });
    console.error("[ErrorBoundary]", error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex flex-col items-center justify-center h-full p-6 text-center">
          <div className="max-w-lg w-full space-y-4">
            <div className="w-12 h-12 mx-auto rounded-full bg-iot-red/10 border border-iot-red/20 flex items-center justify-center">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-iot-red">
                <circle cx="12" cy="12" r="10" />
                <line x1="15" y1="9" x2="9" y2="15" />
                <line x1="9" y1="9" x2="15" y2="15" />
              </svg>
            </div>
            <h2 className="text-sm font-semibold text-iot-text-primary">
              Something went wrong
            </h2>
            <div className="bg-iot-bg-base border border-iot-border rounded-lg p-3 text-left">
              <p className="text-xs font-mono text-iot-red break-all">
                {this.state.error?.message || "Unknown error"}
              </p>
              {this.state.error?.stack && (
                <pre className="mt-2 text-2xs font-mono text-iot-text-muted whitespace-pre-wrap break-all max-h-40 overflow-auto">
                  {this.state.error.stack}
                </pre>
              )}
              {this.state.errorInfo?.componentStack && (
                <details className="mt-2">
                  <summary className="text-2xs text-iot-text-disabled cursor-pointer hover:text-iot-text-muted">
                    Component stack
                  </summary>
                  <pre className="mt-1 text-2xs font-mono text-iot-text-disabled whitespace-pre-wrap break-all max-h-32 overflow-auto">
                    {this.state.errorInfo.componentStack}
                  </pre>
                </details>
              )}
            </div>
            <button
              onClick={() => this.setState({ hasError: false, error: null, errorInfo: null })}
              className="px-4 py-1.5 text-xs font-medium rounded bg-iot-cyan/20 text-iot-cyan border border-iot-cyan/30 hover:bg-iot-cyan/30 transition-colors"
            >
              Try Again
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

function MainContent() {
  const { activeView } = useAppStore();
  const { activeConnectionId } = useConnectionStore();

  if (activeView === "connection") {
    return <ConnectionPanel />;
  }

  if (activeView === "logs") {
    return <LogPanel />;
  }

  if (activeView === "settings") {
    return <SettingsPanel />;
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
        <div className="flex h-full">
          <div className="w-72 border-r border-iot-border flex-shrink-0">
            <SubscriptionManager />
          </div>
          <div className="flex-1 min-w-0">
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
  const refreshConnections = useConnectionStore((s) => s.refreshConnections);
  const refreshStatusForActiveConnection = useConnectionStore((s) => s.refreshStatusForActiveConnection);
  const refreshSubscriptions = useSubscriptionStore((s) => s.refreshSubscriptions);
  const activeView = useAppStore((s) => s.activeView);

  // Start backend log polling on mount
  useEffect(() => {
    startBackendLogPolling();
    return () => stopBackendLogPolling();
  }, []);

  useEffect(() => {
    void refreshConnections();
  }, [refreshConnections]);

  useEffect(() => {
    if (!activeConnectionId) return;
    void refreshSubscriptions(activeConnectionId);
  }, [activeConnectionId, refreshSubscriptions]);

  useEffect(() => {
    if (!activeConnectionId) return;
    void refreshStatusForActiveConnection();
    const interval = setInterval(() => {
      void refreshStatusForActiveConnection();
    }, 3000);
    return () => clearInterval(interval);
  }, [activeConnectionId, refreshStatusForActiveConnection]);

  useEffect(() => {
    if (!activeConnectionId && activeView !== "connection" && activeView !== "logs" && activeView !== "settings") {
      setActiveView("connection");
    }
  }, [activeConnectionId, activeView, setActiveView]);

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
      "8": "logs",
      "9": "settings",
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey;

      // Ctrl/Cmd+1-9 for view navigation
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
              <ErrorBoundary>
                <MainContent />
              </ErrorBoundary>
            </main>
          </div>
        </div>
        <StatusBar />
      </div>
      <ToastContainer />
    </AppShell>
  );
}
