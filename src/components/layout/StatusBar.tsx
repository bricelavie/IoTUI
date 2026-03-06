import React, { useState, useEffect } from "react";
import { useConnectionStore } from "@/stores/connectionStore";
import { useSubscriptionStore } from "@/stores/subscriptionStore";
import { useAppStore } from "@/stores/appStore";
import { Clock, Database, Activity, Zap } from "lucide-react";

export const StatusBar: React.FC = () => {
  const { connections, activeConnectionId } = useConnectionStore();
  const { subscriptions, monitoredValues, isPolling } = useSubscriptionStore();
  const { activeProtocol } = useAppStore();
  const [time, setTime] = useState(new Date());

  useEffect(() => {
    const interval = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(interval);
  }, []);

  const activeConn = connections.find((c) => c.id === activeConnectionId);
  const totalMonitored = subscriptions.reduce(
    (sum, s) => sum + s.monitored_items.length,
    0
  );

  // Determine the publishing interval for live rate display
  const activeSubInterval = subscriptions.length > 0
    ? subscriptions[0].publishing_interval
    : null;

  const protocolLabel = activeProtocol === "opcua" ? "OPC UA" : activeProtocol === "mqtt" ? "MQTT" : "Modbus";
  const backendType = activeConn
    ? activeConn.is_simulator
      ? "Simulator"
      : "Live"
    : "—";

  return (
    <div className="flex items-center justify-between h-6 px-3 bg-iot-bg-surface/80 border-t border-iot-border flex-shrink-0 text-2xs font-mono text-iot-text-disabled select-none">
      {/* Left section */}
      <div className="flex items-center gap-4">
        <span className="flex items-center gap-1">
          <Database size={10} />
          {connections.length} conn{connections.length !== 1 ? "s" : ""}
        </span>
        {activeConn && (
          <>
            <span className="flex items-center gap-1">
              <Activity size={10} className={isPolling ? "text-iot-cyan" : ""} />
              {totalMonitored} monitored
            </span>
            <span className="flex items-center gap-1">
              {monitoredValues.size} values
            </span>
          </>
        )}
      </div>

      {/* Center */}
      <div className="flex items-center gap-2">
        {isPolling && (
          <span className="flex items-center gap-1 text-iot-cyan">
            <span className="w-1.5 h-1.5 rounded-full bg-iot-cyan animate-pulse-slow" />
            LIVE
            {activeSubInterval && (
              <span className="text-iot-text-disabled ml-1">@{activeSubInterval}ms</span>
            )}
          </span>
        )}
      </div>

      {/* Right section */}
      <div className="flex items-center gap-3">
        <span className="flex items-center gap-1">
          <Zap size={10} />
          {protocolLabel}
        </span>
        <span className={`flex items-center gap-1 ${
          activeConn
            ? activeConn.is_simulator
              ? "text-iot-text-disabled"
              : "text-iot-green"
            : ""
        }`}>
          {backendType !== "—" && (
            <span className={`w-1.5 h-1.5 rounded-full ${
              activeConn?.is_simulator ? "bg-iot-text-disabled" : "bg-iot-green"
            }`} />
          )}
          {backendType}
        </span>
        <span className="flex items-center gap-1">
          <Clock size={10} />
          {time.toLocaleTimeString()}
        </span>
      </div>
    </div>
  );
};
