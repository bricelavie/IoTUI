import React, { useMemo, useRef, useState, useEffect } from "react";
import { useSubscriptionStore } from "@/stores/subscriptionStore";
import { useAppStore } from "@/stores/appStore";
import { Card, Badge, Button, EmptyState } from "@/components/ui";
import { RealtimeChart } from "@/components/charts/RealtimeChart";
import { LayoutDashboard, FolderTree } from "lucide-react";
import type { MonitoredValue } from "@/types/opcua";

function computeStats(history: { timestamp: number; value: number }[]) {
  if (history.length === 0) return { min: 0, max: 0, avg: 0 };
  const values = history.map((h) => h.value);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const avg = values.reduce((a, b) => a + b, 0) / values.length;
  return { min, max, avg };
}

const DashboardTile: React.FC<{ value: MonitoredValue }> = ({ value }) => {
  const stats = useMemo(() => computeStats(value.history), [value.history]);
  const hasNumericData = value.numericValue !== undefined && value.history.length > 1;
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const [chartWidth, setChartWidth] = useState(300);

  useEffect(() => {
    if (!chartContainerRef.current) return;
    const obs = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setChartWidth(Math.floor(entry.contentRect.width));
      }
    });
    obs.observe(chartContainerRef.current);
    return () => obs.disconnect();
  }, []);

  return (
    <Card className="flex flex-col overflow-hidden" glow={value.status_code === "Good" ? "cyan" : "none"}>
      {/* Header + value */}
      <div className="px-3 pt-3 pb-2">
        <div className="flex items-start justify-between gap-2 mb-1">
          <h4 className="text-xs font-semibold text-iot-text-primary truncate flex-1">
            {value.display_name}
          </h4>
          <Badge variant={value.status_code === "Good" ? "success" : "danger"}>
            {value.status_code}
          </Badge>
        </div>
        <div className="flex items-baseline gap-2">
          <span className="text-xl font-mono font-bold text-iot-text-primary">
            {hasNumericData ? value.numericValue!.toFixed(2) : value.value}
          </span>
          {value.unit && <span className="text-xs text-iot-text-muted">{value.unit}</span>}
          <span className="text-2xs text-iot-text-disabled ml-auto">{value.data_type}</span>
        </div>
      </div>

      {/* Chart — full width, edge-to-edge with controls */}
      {hasNumericData && (
        <div className="px-1 flex-1 min-w-0" ref={chartContainerRef}>
          <RealtimeChart
            data={value.history}
            width={chartWidth}
            height={150}
            color="#00d4aa"
            showGrid
            showAxis
            showControls
          />
        </div>
      )}

      {/* Stats footer */}
      {hasNumericData && (
        <div className="flex items-center gap-3 px-3 py-1.5 text-2xs border-t border-iot-border/30 mt-1">
          <div className="font-mono">
            <span className="text-iot-text-disabled">Min </span>
            <span className="text-iot-text-muted">{stats.min.toFixed(2)}</span>
          </div>
          <div className="font-mono">
            <span className="text-iot-text-disabled">Max </span>
            <span className="text-iot-text-muted">{stats.max.toFixed(2)}</span>
          </div>
          <div className="font-mono">
            <span className="text-iot-text-disabled">Avg </span>
            <span className="text-iot-text-muted">{stats.avg.toFixed(2)}</span>
          </div>
          <div className="font-mono ml-auto">
            <span className="text-iot-text-disabled">{value.history.length} pts</span>
          </div>
        </div>
      )}
    </Card>
  );
};

export const Dashboard: React.FC = () => {
  const { monitoredValues, isPolling, subscriptions, activeSubscriptionId } =
    useSubscriptionStore();
  const { setActiveView } = useAppStore();

  const values = useMemo(
    () => Array.from(monitoredValues.values()),
    [monitoredValues]
  );

  const activeSub = subscriptions.find((s) => s.id === activeSubscriptionId);

  if (values.length === 0) {
    return (
      <div className="h-full flex items-center justify-center">
        <EmptyState
          icon={<LayoutDashboard size={32} />}
          title="No Monitored Values"
          description="Browse the address space to find variables, then click Monitor to start tracking them here"
          action={
            <Button
              variant="primary"
              size="sm"
              onClick={() => setActiveView("browse")}
            >
              <FolderTree size={12} />
              Browse Address Space
            </Button>
          }
        />
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col">
      {/* Dashboard header bar */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-iot-border flex-shrink-0">
        <div className="flex items-center gap-2">
          <LayoutDashboard size={14} className="text-iot-cyan" />
          <span className="text-xs font-semibold text-iot-text-secondary uppercase tracking-wider">
            Live Dashboard
          </span>
          <Badge variant="info">{values.length} values</Badge>
        </div>
        <div className="flex items-center gap-2">
          {isPolling && (
            <span className="flex items-center gap-1 text-2xs text-iot-cyan">
              <span className="w-1.5 h-1.5 rounded-full bg-iot-cyan animate-pulse-slow" />
              LIVE
            </span>
          )}
          {activeSub && (
            <Badge variant="default">{activeSub.publishing_interval}ms</Badge>
          )}
        </div>
      </div>

      {/* Grid of tiles */}
      <div className="flex-1 overflow-auto p-4">
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-4">
          {values.map((val) => (
            <DashboardTile key={val.node_id} value={val} />
          ))}
        </div>
      </div>
    </div>
  );
};
