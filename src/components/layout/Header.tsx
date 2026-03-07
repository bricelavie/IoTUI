import React, { useState } from "react";
import { useConnectionStore } from "@/stores/connectionStore";
import { useAppStore } from "@/stores/appStore";
import { useSubscriptionStore } from "@/stores/subscriptionStore";
import { StatusDot, Badge } from "@/components/ui";
import { ConfirmDialog } from "@/components/ui/Modal";
import { Wifi, WifiOff, Server } from "lucide-react";
import type { ViewMode } from "@/types/opcua";

export const Header: React.FC = () => {
  const connections = useConnectionStore((s) => s.connections);
  const activeConnectionId = useConnectionStore((s) => s.activeConnectionId);
  const disconnect = useConnectionStore((s) => s.disconnect);
  const activeView = useAppStore((s) => s.activeView);
  const activeSubscriptionId = useSubscriptionStore((s) => s.activeSubscriptionId);
  const getSubStatus = useSubscriptionStore((s) => s.getSubStatus);
  const [confirmDisconnect, setConfirmDisconnect] = useState(false);

  const activeConnection = connections.find((c) => c.id === activeConnectionId);
  const activeSubStatus = activeSubscriptionId ? getSubStatus(activeSubscriptionId) : null;

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
  };

  return (
    <>
      <div className="flex items-center justify-between h-10 px-4 bg-iot-bg-surface/50 border-b border-iot-border flex-shrink-0">
        {/* Left: View title */}
        <div className="flex items-center gap-3">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-iot-text-secondary">
            {viewLabels[activeView] || activeView}
          </h2>
        </div>

        {/* Right: Connection status */}
        <div className="flex items-center gap-3">
          {activeConnection ? (
            <>
              <div className="flex items-center gap-2">
                <StatusDot
                  status={
                    activeConnection.status === "connected"
                      ? "connected"
                      : activeConnection.status === "error"
                      ? "error"
                      : activeConnection.status === "connecting" || activeConnection.status === "reconnecting"
                      ? "warning"
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
              <Badge variant={activeConnection.status === "connected" ? "success" : "warning"}>
                {activeConnection.status}
              </Badge>
              {activeConnection.last_error && (
                <Badge variant="danger">health issue</Badge>
              )}
              {activeSubStatus?.lastError && (
                <Badge variant="warning">poll degraded</Badge>
              )}
              {activeConnection.security_policy !== "None" && (
                <Badge variant="info">{activeConnection.security_policy}</Badge>
              )}
              <button
                onClick={() => setConfirmDisconnect(true)}
                className="text-2xs text-iot-text-disabled hover:text-iot-red transition-colors"
                title="Disconnect"
              >
                <WifiOff size={14} />
              </button>
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
            disconnect(activeConnection.id);
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
