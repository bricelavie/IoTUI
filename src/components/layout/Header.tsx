import React, { useState } from "react";
import { useConnectionStore } from "@/stores/connectionStore";
import { useMqttConnectionStore } from "@/stores/mqttConnectionStore";
import { useAppStore } from "@/stores/appStore";
import { useSubscriptionStore } from "@/stores/subscriptionStore";
import { useMqttSubscriptionStore } from "@/stores/mqttSubscriptionStore";
import { StatusDot, Badge, Tooltip } from "@/components/ui";
import { ConfirmDialog } from "@/components/ui/Modal";
import { Wifi, WifiOff, Server, Radio } from "lucide-react";
import type { ViewMode } from "@/types/opcua";

export const Header: React.FC = () => {
  const activeProtocol = useAppStore((s) => s.activeProtocol);
  const activeView = useAppStore((s) => s.activeView);

  // OPC UA state
  const opcuaConnections = useConnectionStore((s) => s.connections);
  const opcuaActiveId = useConnectionStore((s) => s.activeConnectionId);
  const opcuaDisconnect = useConnectionStore((s) => s.disconnect);
  const opcuaActiveSubId = useSubscriptionStore((s) => s.activeSubscriptionId);
  const opcuaGetSubStatus = useSubscriptionStore((s) => s.getSubStatus);

  // MQTT state
  const mqttConnections = useMqttConnectionStore((s) => s.connections);
  const mqttActiveId = useMqttConnectionStore((s) => s.activeConnectionId);
  const mqttDisconnect = useMqttConnectionStore((s) => s.disconnect);
  const mqttIsPolling = useMqttSubscriptionStore((s) => s.isPolling);

  const [confirmDisconnect, setConfirmDisconnect] = useState(false);

  const viewLabels: Partial<Record<ViewMode, string>> = {
    connection: "Connection Manager",
    browse: "Address Space Browser",
    attributes: "Node Attributes",
    subscriptions: "Subscriptions & Monitoring",
    dashboard: "Live Dashboard",
    methods: "Method Calls",
    events: "Alarms & Events",
    export: "Data Export",
    logs: "Logs",
    settings: "Settings",
    mqtt_connection: "Connection Manager",
    mqtt_explorer: "Topic Explorer",
    mqtt_dashboard: "Live Dashboard",
    mqtt_broker_admin: "Broker Admin",
  };

  if (activeProtocol === "mqtt") {
    const activeConnection = mqttConnections.find((c) => c.id === mqttActiveId);
    const activeSubStatus = mqttIsPolling;

    return (
      <>
        <div className="flex items-center justify-between h-10 px-4 bg-iot-bg-surface/50 border-b border-iot-border flex-shrink-0">
          <div className="flex items-center gap-3">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-iot-text-secondary">
              {viewLabels[activeView] || activeView}
            </h2>
          </div>

          <div className="flex items-center gap-3">
            {activeConnection ? (
              <>
                <div className="flex items-center gap-2">
                  <StatusDot
                    status={
                      activeConnection.status === "connected" ? "connected"
                      : activeConnection.status === "error" ? "error"
                      : activeConnection.status === "connecting" || activeConnection.status === "reconnecting" ? "warning"
                      : "disconnected"
                    }
                  />
                  <div className="flex items-center gap-1.5">
                    <Radio size={12} className="text-iot-text-muted" />
                    <span className="text-xs text-iot-text-secondary font-medium">
                      {activeConnection.name}
                    </span>
                    <span className="text-2xs text-iot-text-disabled font-mono">
                      {activeConnection.host}:{activeConnection.port}
                    </span>
                  </div>
                </div>
                <Badge variant={activeConnection.status === "connected" ? "success" : activeConnection.status === "error" ? "danger" : "warning"}>
                  {activeConnection.status}
                </Badge>
                <Badge variant={activeConnection.mode === "broker" ? "default" : "success"}>
                  {activeConnection.mode.toUpperCase()}
                </Badge>
                {activeSubStatus && (
                  <span className="flex items-center gap-1 text-2xs text-iot-cyan">
                    <span className="w-1.5 h-1.5 rounded-full bg-iot-cyan animate-pulse-slow" />
                    LIVE
                  </span>
                )}
                {activeConnection.last_error && <Badge variant="danger">health issue</Badge>}
                <Tooltip content="Disconnect">
                  <button
                    onClick={() => setConfirmDisconnect(true)}
                    className="text-2xs text-iot-text-disabled hover:text-iot-red transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-iot-border-focus focus-visible:ring-offset-1 focus-visible:ring-offset-iot-bg-base rounded"
                  >
                    <WifiOff size={14} />
                  </button>
                </Tooltip>
              </>
            ) : (
              <div className="flex items-center gap-2 text-iot-text-disabled">
                <Wifi size={14} />
                <span className="text-xs">Not connected</span>
              </div>
            )}
          </div>
        </div>

        {activeConnection && (
          <ConfirmDialog
            open={confirmDisconnect}
            onClose={() => setConfirmDisconnect(false)}
            onConfirm={() => {
              mqttDisconnect(activeConnection.id);
              setConfirmDisconnect(false);
            }}
            title="Disconnect"
            message={`Disconnect from "${activeConnection.name}"? Active subscriptions will be stopped.`}
            confirmLabel="Disconnect"
            danger
          />
        )}
      </>
    );
  }

  // OPC UA header (original)
  const activeConnection = opcuaConnections.find((c) => c.id === opcuaActiveId);
  const activeSubStatus = opcuaActiveSubId ? opcuaGetSubStatus(opcuaActiveSubId) : null;

  return (
    <>
      <div className="flex items-center justify-between h-10 px-4 bg-iot-bg-surface/50 border-b border-iot-border flex-shrink-0">
        <div className="flex items-center gap-3">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-iot-text-secondary">
            {viewLabels[activeView] || activeView}
          </h2>
        </div>

        <div className="flex items-center gap-3">
          {activeConnection ? (
            <>
              <div className="flex items-center gap-2">
                <StatusDot
                  status={
                    activeConnection.status === "connected" ? "connected"
                    : activeConnection.status === "error" ? "error"
                    : activeConnection.status === "connecting" || activeConnection.status === "reconnecting" ? "warning"
                    : "disconnected"
                  }
                />
                <div className="flex items-center gap-1.5">
                  <Server size={12} className="text-iot-text-muted" />
                  <span className="text-xs text-iot-text-secondary font-medium">
                    {activeConnection.name}
                  </span>
                  <span className="text-2xs text-iot-text-disabled font-mono">
                    {activeConnection.endpoint_url}
                  </span>
                </div>
              </div>
              <Badge variant={activeConnection.status === "connected" ? "success" : activeConnection.status === "error" ? "danger" : "warning"}>
                {activeConnection.status}
              </Badge>
              {activeConnection.last_error && <Badge variant="danger">health issue</Badge>}
              {activeSubStatus?.lastError && <Badge variant="warning">poll degraded</Badge>}
              {activeConnection.security_policy !== "None" && (
                <Badge variant="info">{activeConnection.security_policy}</Badge>
              )}
              <Tooltip content="Disconnect">
                <button
                  onClick={() => setConfirmDisconnect(true)}
                  className="text-2xs text-iot-text-disabled hover:text-iot-red transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-iot-border-focus focus-visible:ring-offset-1 focus-visible:ring-offset-iot-bg-base rounded"
                >
                  <WifiOff size={14} />
                </button>
              </Tooltip>
            </>
          ) : (
            <div className="flex items-center gap-2 text-iot-text-disabled">
              <Wifi size={14} />
              <span className="text-xs">Not connected</span>
            </div>
          )}
        </div>
      </div>

      {activeConnection && (
        <ConfirmDialog
          open={confirmDisconnect}
          onClose={() => setConfirmDisconnect(false)}
          onConfirm={() => {
            opcuaDisconnect(activeConnection.id);
            setConfirmDisconnect(false);
          }}
          title="Disconnect"
          message={`Disconnect from "${activeConnection.name}"? Active subscriptions will be stopped.`}
          confirmLabel="Disconnect"
          danger
        />
      )}
    </>
  );
};
