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
// MQTT components
import { MqttConnectionPanel } from "@/components/mqtt/MqttConnectionPanel";
import { MqttExplorer } from "@/components/mqtt/MqttExplorer";
import { MqttDashboard } from "@/components/mqtt/MqttDashboard";
import { BrokerAdminPanel } from "@/components/mqtt/BrokerAdminPanel";

import { useAppStore } from "@/stores/appStore";
import { useThemeStore } from "@/stores/themeStore";
import { useConnectionStore } from "@/stores/connectionStore";
import { useSubscriptionStore } from "@/stores/subscriptionStore";
import { useMqttConnectionStore } from "@/stores/mqttConnectionStore";
import { useMqttSubscriptionStore } from "@/stores/mqttSubscriptionStore";
import { useMqttTopicStore } from "@/stores/mqttTopicStore";
import { useMqttBrokerStore } from "@/stores/mqttBrokerStore";
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

// ─── MQTT Content Routing ────────────────────────────────────────

function MqttContent({ view }: { view: ViewMode }) {
  const { activeConnectionId } = useMqttConnectionStore();

  if (view === "mqtt_connection") {
    return <MqttConnectionPanel />;
  }

  // Shared views (logs, settings) are protocol-agnostic
  if (view === "logs") {
    return <LogPanel />;
  }
  if (view === "settings") {
    return <SettingsPanel />;
  }

  // All other MQTT views require an active connection
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
          <p className="text-xs text-iot-text-muted mt-1">Connect to an MQTT broker to get started</p>
        </div>
      </div>
    );
  }

  switch (view) {
    case "mqtt_explorer":
      return <MqttExplorer />;
    case "mqtt_dashboard":
      return <MqttDashboard />;
    case "mqtt_broker_admin":
      return <BrokerAdminPanel />;
    default:
      return <MqttConnectionPanel />;
  }
}

// ─── OPC UA Content Routing ──────────────────────────────────────

function OpcUaContent({ view }: { view: ViewMode }) {
  const { activeConnectionId } = useConnectionStore();

  if (view === "connection") {
    return <ConnectionPanel />;
  }

  if (view === "logs") {
    return <LogPanel />;
  }

  if (view === "settings") {
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

  switch (view) {
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

// ─── Main Content Router ─────────────────────────────────────────

function MainContent() {
  const { activeView, activeProtocol } = useAppStore();

  if (activeProtocol === "mqtt") {
    return <MqttContent view={activeView} />;
  }

  return <OpcUaContent view={activeView} />;
}

// ─── App ─────────────────────────────────────────────────────────

export default function App() {
  // ─── Theme hydration (must run before anything renders) ────────
  const hydrateTheme = useThemeStore((s) => s.hydrate);
  useEffect(() => {
    hydrateTheme();
  }, [hydrateTheme]);

  const setActiveView = useAppStore((s) => s.setActiveView);
  const activeProtocol = useAppStore((s) => s.activeProtocol);
  const activeView = useAppStore((s) => s.activeView);

  // OPC UA stores
  const opcuaDisconnect = useConnectionStore((s) => s.disconnect);
  const opcuaActiveConnectionId = useConnectionStore((s) => s.activeConnectionId);
  const opcuaRefreshConnections = useConnectionStore((s) => s.refreshConnections);
  const opcuaRefreshStatus = useConnectionStore((s) => s.refreshStatusForActiveConnection);
  const opcuaRefreshSubscriptions = useSubscriptionStore((s) => s.refreshSubscriptions);

  // MQTT stores
  const mqttActiveConnectionId = useMqttConnectionStore((s) => s.activeConnectionId);
  const mqttDisconnect = useMqttConnectionStore((s) => s.disconnect);
  const mqttRefreshConnections = useMqttConnectionStore((s) => s.refreshConnections);
  const mqttRefreshStatus = useMqttConnectionStore((s) => s.refreshStatusForActiveConnection);
  const mqttRefreshSubscriptions = useMqttSubscriptionStore((s) => s.refreshSubscriptions);
  const mqttStartPolling = useMqttSubscriptionStore((s) => s.startPolling);
  const mqttStopPolling = useMqttSubscriptionStore((s) => s.stopPolling);
  const mqttLatestBatch = useMqttSubscriptionStore((s) => s.latestBatch);
  const mqttAddMessages = useMqttTopicStore((s) => s.addMessages);
  const mqttRefreshTopics = useMqttTopicStore((s) => s.refreshTopics);
  const mqttClearTopics = useMqttTopicStore((s) => s.clearAll);
  const mqttBrokerClearAll = useMqttBrokerStore((s) => s.clearAll);
  const mqttSubClearAll = useMqttSubscriptionStore((s) => s.clearAll);

  // ─── Backend log polling (always on) ───────────────────────────
  useEffect(() => {
    startBackendLogPolling();
    return () => stopBackendLogPolling();
  }, []);

  // ─── OPC UA lifecycle effects ──────────────────────────────────

  // Refresh OPC UA connections on mount / when protocol is opcua
  useEffect(() => {
    if (activeProtocol !== "opcua") return;
    void opcuaRefreshConnections();
  }, [activeProtocol, opcuaRefreshConnections]);

  // OPC UA subscription refresh when connection changes
  useEffect(() => {
    if (activeProtocol !== "opcua") return;
    if (!opcuaActiveConnectionId) return;
    void opcuaRefreshSubscriptions(opcuaActiveConnectionId);
  }, [activeProtocol, opcuaActiveConnectionId, opcuaRefreshSubscriptions]);

  // OPC UA status polling
  useEffect(() => {
    if (activeProtocol !== "opcua") return;
    if (!opcuaActiveConnectionId) return;
    void opcuaRefreshStatus();
    const interval = setInterval(() => {
      void opcuaRefreshStatus();
    }, 3000);
    return () => clearInterval(interval);
  }, [activeProtocol, opcuaActiveConnectionId, opcuaRefreshStatus]);

  // Redirect to connection view when OPC UA connection is lost
  useEffect(() => {
    if (activeProtocol !== "opcua") return;
    if (!opcuaActiveConnectionId && activeView !== "connection" && activeView !== "logs" && activeView !== "settings") {
      setActiveView("connection");
    }
  }, [activeProtocol, opcuaActiveConnectionId, activeView, setActiveView]);

  // ─── MQTT lifecycle effects ────────────────────────────────────

  // Refresh MQTT connections on mount / when protocol is mqtt
  useEffect(() => {
    if (activeProtocol !== "mqtt") return;
    void mqttRefreshConnections();
  }, [activeProtocol, mqttRefreshConnections]);

  // Start/stop MQTT message polling when connection changes
  useEffect(() => {
    if (activeProtocol !== "mqtt" || !mqttActiveConnectionId) {
      mqttStopPolling();
      return;
    }

    // Refresh subscriptions for the new connection
    void mqttRefreshSubscriptions(mqttActiveConnectionId);
    void mqttRefreshTopics(mqttActiveConnectionId);

    // Start polling messages
    mqttStartPolling(mqttActiveConnectionId);

    return () => {
      mqttStopPolling();
    };
  }, [activeProtocol, mqttActiveConnectionId, mqttRefreshSubscriptions, mqttRefreshTopics, mqttStartPolling, mqttStopPolling]);

  // MQTT status polling
  useEffect(() => {
    if (activeProtocol !== "mqtt") return;
    if (!mqttActiveConnectionId) return;
    void mqttRefreshStatus();
    const interval = setInterval(() => {
      void mqttRefreshStatus();
    }, 3000);
    return () => clearInterval(interval);
  }, [activeProtocol, mqttActiveConnectionId, mqttRefreshStatus]);

  // Periodically refresh MQTT subscription info (message counts, rates)
  useEffect(() => {
    if (activeProtocol !== "mqtt" || !mqttActiveConnectionId) return;
    const interval = setInterval(() => {
      void mqttRefreshSubscriptions(mqttActiveConnectionId);
    }, 2000);
    return () => clearInterval(interval);
  }, [activeProtocol, mqttActiveConnectionId, mqttRefreshSubscriptions]);

  // Feed newly polled messages into topic store
  useEffect(() => {
    if (mqttLatestBatch.length > 0) {
      mqttAddMessages(mqttLatestBatch);
    }
  }, [mqttLatestBatch, mqttAddMessages]);

  // Periodically refresh MQTT topics while connected
  useEffect(() => {
    if (activeProtocol !== "mqtt" || !mqttActiveConnectionId) return;
    const interval = setInterval(() => {
      void mqttRefreshTopics(mqttActiveConnectionId);
    }, 5000);
    return () => clearInterval(interval);
  }, [activeProtocol, mqttActiveConnectionId, mqttRefreshTopics]);

  // Redirect to mqtt_connection view when MQTT connection is lost
  useEffect(() => {
    if (activeProtocol !== "mqtt") return;
    const mqttViews: ViewMode[] = ["mqtt_explorer", "mqtt_dashboard", "mqtt_broker_admin"];
    if (!mqttActiveConnectionId && mqttViews.includes(activeView as ViewMode)) {
      setActiveView("mqtt_connection");
    }
  }, [activeProtocol, mqttActiveConnectionId, activeView, setActiveView]);

  // Clean up MQTT stores when switching away from MQTT protocol
  useEffect(() => {
    if (activeProtocol !== "mqtt") {
      mqttSubClearAll();
      mqttClearTopics();
      mqttBrokerClearAll();
    }
  }, [activeProtocol, mqttSubClearAll, mqttClearTopics, mqttBrokerClearAll]);

  // ─── Global keyboard shortcuts ────────────────────────────────

  useEffect(() => {
    const opcuaShortcuts: Record<string, ViewMode> = {
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

    const mqttShortcuts: Record<string, ViewMode> = {
      "1": "mqtt_connection",
      "2": "mqtt_explorer",
      "3": "mqtt_dashboard",
      "4": "mqtt_broker_admin",
      "5": "logs",
      "6": "settings",
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey;

      const shortcuts = activeProtocol === "mqtt" ? mqttShortcuts : opcuaShortcuts;

      // Ctrl/Cmd+1-9 for view navigation
      if (mod && shortcuts[e.key]) {
        e.preventDefault();
        setActiveView(shortcuts[e.key]);
        return;
      }

      // Ctrl/Cmd+D to disconnect
      if (mod && e.key === "d") {
        e.preventDefault();
        if (activeProtocol === "mqtt" && mqttActiveConnectionId) {
          mqttDisconnect(mqttActiveConnectionId);
        } else if (activeProtocol === "opcua" && opcuaActiveConnectionId) {
          opcuaDisconnect(opcuaActiveConnectionId);
        }
        return;
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [setActiveView, activeProtocol, opcuaDisconnect, opcuaActiveConnectionId, mqttDisconnect, mqttActiveConnectionId]);

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
