import React, { useMemo, useState, useEffect } from "react";
import { useModbusMonitorStore } from "@/stores/modbusMonitorStore";
import { useModbusConnectionStore } from "@/stores/modbusConnectionStore";
import { useAppStore } from "@/stores/appStore";
import { getSetting } from "@/stores/settingsStore";
import { Card, Badge, Button, EmptyState } from "@/components/ui";
import { LayoutDashboard, Activity } from "lucide-react";
import { DashboardSparkline } from "@/components/charts/DashboardSparkline";
import { smartFormat } from "@/utils/stats";
import { registerTypeLabel, dataTypeLabel } from "@/utils/modbus";

// ─── Types ───────────────────────────────────────────────────────

interface NumericMonitorData {
  monitorId: number;
  label: string;
  registerType: string;
  dataType: string;
  values: { address: number; numericValue: number }[];
  currentValue: number;
  min: number;
  max: number;
  avg: number;
  lastError: string | null;
}

// ─── Component ───────────────────────────────────────────────────

export const ModbusDashboard: React.FC = () => {
  const monitors = useModbusMonitorStore((s) => s.monitors);
  const isPolling = useModbusMonitorStore((s) => s.isPolling);
  const pollError = useModbusMonitorStore((s) => s.pollError);
  const lastPollAt = useModbusMonitorStore((s) => s.lastPollAt);
  const { activeConnectionId } = useModbusConnectionStore();
  const { setActiveView } = useAppStore();

  // Stale detection: track whether the poll is stale via a ref + transition state
  const lastPollAtRef = React.useRef(lastPollAt);
  lastPollAtRef.current = lastPollAt;
  const [isStale, setIsStale] = useState(false);

  const pollInterval = getSetting("modbusPollInterval");
  const staleThreshold = Math.max(pollInterval * 4, 5000);

  useEffect(() => {
    if (!isPolling) {
      setIsStale(false);
      return;
    }
    const id = setInterval(() => {
      const lp = lastPollAtRef.current;
      const stale = lp != null && Date.now() - lp > staleThreshold;
      setIsStale((prev) => (prev !== stale ? stale : prev));
    }, 1000);
    return () => clearInterval(id);
  }, [isPolling, staleThreshold]);

  // Extract numeric values from monitors
  const numericMonitors = useMemo(() => {
    const result: NumericMonitorData[] = [];

    for (const monitor of monitors) {
      if (monitor.latest_values.length === 0) continue;

      const nums = monitor.latest_values
        .map((v) => parseFloat(v.value))
        .filter((n) => Number.isFinite(n));

      if (nums.length === 0) continue;

      result.push({
        monitorId: monitor.id,
        label: monitor.label,
        registerType: registerTypeLabel(monitor.register_type),
        dataType: dataTypeLabel(monitor.data_type),
        values: monitor.latest_values
          .map((v) => ({ address: v.address, numericValue: parseFloat(v.value) }))
          .filter((v) => Number.isFinite(v.numericValue)),
        currentValue: nums[nums.length - 1],
        min: nums.reduce((a, b) => (b < a ? b : a), nums[0]),
        max: nums.reduce((a, b) => (b > a ? b : a), nums[0]),
        avg: nums.reduce((a, b) => a + b, 0) / nums.length,
        lastError: monitor.last_error ?? null,
      });
    }

    return result;
  }, [monitors]);

  if (!activeConnectionId || numericMonitors.length === 0) {
    return (
      <div className="h-full flex items-center justify-center">
        <EmptyState
          icon={<LayoutDashboard size={32} />}
          title="No Monitor Data"
          description="Add register monitors and start polling to see live dashboard"
          action={
            <Button variant="primary" size="sm" onClick={() => setActiveView("modbus_monitor")}>
              <Activity size={12} />
              Manage Monitors
            </Button>
          }
        />
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-iot-border flex-shrink-0">
        <div className="flex items-center gap-2">
          <LayoutDashboard size={14} className="text-iot-cyan" />
          <span className="text-xs font-semibold text-iot-text-secondary uppercase tracking-wider">
            Modbus Dashboard
          </span>
          <Badge variant={isPolling ? "success" : "warning"}>
            {isPolling ? "Live" : "Paused"}
          </Badge>
          <Badge variant="info">{numericMonitors.length} monitors</Badge>
          {isPolling && (
            <Badge variant="default">{pollInterval >= 1000 ? `${pollInterval / 1000}s` : `${pollInterval}ms`}</Badge>
          )}
        </div>
        <div className="flex items-center gap-2">
          {isPolling && (
            <span className="flex items-center gap-1 text-2xs text-iot-cyan">
              <span className="w-1.5 h-1.5 rounded-full bg-iot-cyan animate-pulse-slow" />
              LIVE
            </span>
          )}
          {isStale && <Badge variant="warning">Stale</Badge>}
          {pollError && <Badge variant="danger">Poll Error</Badge>}
        </div>
      </div>

      {/* Grid */}
      <div className="flex-1 overflow-auto p-4">
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-4">
          {numericMonitors.map((data) => {
            const hasError = !!data.lastError;
            return (
            <Card key={data.monitorId} className="flex flex-col overflow-hidden" glow={hasError ? "red" : isPolling ? "cyan" : undefined}>
              <div className="px-3 pt-3 pb-2">
                <div className="flex items-center justify-between mb-1">
                  <h4 className="text-xs font-semibold text-iot-text-primary truncate">
                    {data.label}
                  </h4>
                  <Badge variant="default" >{data.dataType}</Badge>
                </div>
                <div className="flex items-baseline gap-2">
                  <span className="text-xl font-mono font-bold text-iot-text-primary">
                    {smartFormat(data.currentValue)}
                  </span>
                  <span className="text-2xs text-iot-text-disabled ml-auto">
                    {data.values.length} regs
                  </span>
                </div>
              </div>

              <div className="px-1 pb-2 flex-1 min-w-0">
                <DashboardSparkline data={data.values.map((v) => v.numericValue)} height={80} />
              </div>

              <div className="flex items-center gap-3 px-3 py-1.5 text-2xs border-t border-iot-border/30">
                <div className="font-mono">
                  <span className="text-iot-text-disabled">Min </span>
                  <span className="text-iot-text-muted">{smartFormat(data.min)}</span>
                </div>
                <div className="font-mono">
                  <span className="text-iot-text-disabled">Max </span>
                  <span className="text-iot-text-muted">{smartFormat(data.max)}</span>
                </div>
                <div className="font-mono">
                  <span className="text-iot-text-disabled">Avg </span>
                  <span className="text-iot-text-muted">{smartFormat(data.avg)}</span>
                </div>
              </div>
            </Card>
            );
          })}
        </div>
      </div>
    </div>
  );
};
