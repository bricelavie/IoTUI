import React from "react";
import { useConnectionStore } from "@/stores/connectionStore";
import { useAppStore } from "@/stores/appStore";
import { useSubscriptionStore } from "@/stores/subscriptionStore";
import { StatusDot, Badge } from "@/components/ui";
import { Wifi, WifiOff, Server } from "lucide-react";

export const Header: React.FC = () => {
  const { connections, activeConnectionId, disconnect } = useConnectionStore();
  const { activeView } = useAppStore();
  const { activeSubscriptionId, getSubStatus } = useSubscriptionStore();

  const activeConnection = connections.find((c) => c.id === activeConnectionId);
  const activeSubStatus = activeSubscriptionId ? getSubStatus(activeSubscriptionId) : null;

  const viewLabels: Record<string, string> = {
    connection: "Connection Manager",
    browse: "Address Space Browser",
    attributes: "Node Attributes",
    subscriptions: "Subscriptions & Monitoring",
    dashboard: "Live Dashboard",
    data: "Read / Write Values",
    methods: "Method Calls",
    events: "Alarms & Events",
    export: "Data Export",
  };

  return (
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
              onClick={() => disconnect(activeConnection.id)}
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
  );
};
