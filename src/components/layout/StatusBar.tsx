import React, { useState, useEffect, memo } from "react";
import { useConnectionStore } from "@/stores/connectionStore";
import { useSubscriptionStore } from "@/stores/subscriptionStore";
import { useMqttConnectionStore } from "@/stores/mqttConnectionStore";
import { useMqttSubscriptionStore } from "@/stores/mqttSubscriptionStore";
import { useAppStore } from "@/stores/appStore";
import { Clock, Database, Activity, Zap, MessageSquare } from "lucide-react";

/** Isolated clock component so its 1 Hz re-renders don't propagate to the entire StatusBar. */
const StatusClock: React.FC = memo(() => {
  const [time, setTime] = useState(new Date());

  useEffect(() => {
    const interval = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(interval);
  }, []);

  return (
    <span className="flex items-center gap-1">
      <Clock size={10} />
      {time.toLocaleTimeString()}
    </span>
  );
});
StatusClock.displayName = "StatusClock";

export const StatusBar: React.FC = () => {
  const activeProtocol = useAppStore((s) => s.activeProtocol);

  // OPC UA state
  const opcuaConnections = useConnectionStore((s) => s.connections);
  const opcuaActiveConnectionId = useConnectionStore((s) => s.activeConnectionId);
  const subscriptions = useSubscriptionStore((s) => s.subscriptions);
  const monitoredValues = useSubscriptionStore((s) => s.monitoredValues);
  const activePollers = useSubscriptionStore((s) => s.activePollers);
  const activeSubscriptionId = useSubscriptionStore((s) => s.activeSubscriptionId);
  const getSubStatus = useSubscriptionStore((s) => s.getSubStatus);

  // MQTT state
  const mqttConnections = useMqttConnectionStore((s) => s.connections);
  const mqttActiveConnectionId = useMqttConnectionStore((s) => s.activeConnectionId);
  const mqttSubscriptions = useMqttSubscriptionStore((s) => s.subscriptions);
  const mqttMessages = useMqttSubscriptionStore((s) => s.messages);
  const mqttIsPolling = useMqttSubscriptionStore((s) => s.isPolling);
  const mqttPollError = useMqttSubscriptionStore((s) => s.pollError);

  const protocolLabel = activeProtocol === "opcua" ? "OPC UA" : activeProtocol === "mqtt" ? "MQTT" : "Modbus";

  if (activeProtocol === "mqtt") {
    const activeConn = mqttConnections.find((c) => c.id === mqttActiveConnectionId);
    const backendType = activeConn
      ? activeConn.mode === "broker" ? "Broker" : "Client"
      : "—";

    return (
      <div className="flex items-center justify-between h-6 px-4 bg-iot-bg-surface/80 border-t border-iot-border flex-shrink-0 text-2xs font-mono text-iot-text-disabled select-none">
        <div className="flex items-center gap-4">
          <span className="flex items-center gap-1">
            <Database size={10} />
            {mqttConnections.length} conn{mqttConnections.length !== 1 ? "s" : ""}
          </span>
          {activeConn && (
            <>
              <span className="flex items-center gap-1">
                <Activity size={10} className={mqttIsPolling ? "text-iot-cyan" : ""} />
                {mqttSubscriptions.length} subs
              </span>
              <span className="flex items-center gap-1">
                <MessageSquare size={10} />
                {mqttMessages.length} msgs
              </span>
            </>
          )}
        </div>

        <div className="flex items-center gap-2">
          {mqttIsPolling && (
            <span className="flex items-center gap-1 text-iot-cyan">
              <span className="w-1.5 h-1.5 rounded-full bg-iot-cyan animate-pulse-slow" />
              LIVE
            </span>
          )}
          {mqttPollError && <span className="text-iot-red">POLL ERR</span>}
        </div>

        <div className="flex items-center gap-3">
          <span className="flex items-center gap-1">
            <Zap size={10} />
            {protocolLabel}
          </span>
          <span className={`flex items-center gap-1 ${
            activeConn
              ? "text-iot-green"
              : ""
          }`}>
            {backendType !== "—" && (
              <span className={`w-1.5 h-1.5 rounded-full bg-iot-green`} />
            )}
            {backendType}
          </span>
          <StatusClock />
        </div>
      </div>
    );
  }

  // OPC UA status bar (original)
  const activeConn = opcuaConnections.find((c) => c.id === opcuaActiveConnectionId);
  const totalMonitored = subscriptions.reduce(
    (sum, s) => sum + s.monitored_items.length,
    0
  );

  const activeSubInterval = activeSubscriptionId
    ? subscriptions.find((sub) => sub.id === activeSubscriptionId)?.publishing_interval ?? null
    : null;

  const backendType = activeConn
    ? activeConn.is_simulator ? "Simulator" : "Live"
    : "—";
  const activeSubStatus = activeSubscriptionId ? getSubStatus(activeSubscriptionId) : null;
  const isStale = activeSubStatus?.lastUpdateAt
    ? Date.now() - activeSubStatus.lastUpdateAt > Math.max((activeSubInterval ?? 1000) * 4, 5000)
    : false;

  return (
    <div className="flex items-center justify-between h-6 px-3 bg-iot-bg-surface/80 border-t border-iot-border flex-shrink-0 text-2xs font-mono text-iot-text-disabled select-none">
      <div className="flex items-center gap-4">
        <span className="flex items-center gap-1">
          <Database size={10} />
          {opcuaConnections.length} conn{opcuaConnections.length !== 1 ? "s" : ""}
        </span>
        {activeConn && (
          <>
            <span className="flex items-center gap-1">
              <Activity size={10} className={activePollers.size > 0 ? "text-iot-cyan" : ""} />
              {totalMonitored} monitored
            </span>
            <span className="flex items-center gap-1">
              {monitoredValues.size} values
            </span>
          </>
        )}
      </div>

      <div className="flex items-center gap-2">
        {activePollers.size > 0 && (
          <span className="flex items-center gap-1 text-iot-cyan">
            <span className="w-1.5 h-1.5 rounded-full bg-iot-cyan animate-pulse-slow" />
            LIVE
            {activeSubInterval && (
              <span className="text-iot-text-disabled ml-1">@{activeSubInterval}ms</span>
            )}
          </span>
        )}
        {isStale && <span className="text-iot-amber">STALE</span>}
        {activeSubStatus?.lastError && <span className="text-iot-red">POLL ERR</span>}
      </div>

      <div className="flex items-center gap-3">
        <span className="flex items-center gap-1">
          <Zap size={10} />
          {protocolLabel}
        </span>
        <span className={`flex items-center gap-1 ${
          activeConn
            ? activeConn.is_simulator ? "text-iot-text-disabled" : "text-iot-green"
            : ""
        }`}>
          {backendType !== "—" && (
            <span className={`w-1.5 h-1.5 rounded-full ${
              activeConn?.is_simulator ? "bg-iot-text-disabled" : "bg-iot-green"
            }`} />
          )}
          {backendType}
        </span>
        <StatusClock />
      </div>
    </div>
  );
};
