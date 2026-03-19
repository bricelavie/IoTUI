import React, { useMemo, useState, useCallback } from "react";
import { useContainerWidth } from "@/hooks/useContainerWidth";
import { clsx } from "clsx";
import { useConnectionStore } from "@/stores/connectionStore";
import { useSubscriptionStore } from "@/stores/subscriptionStore";
import { useAppStore } from "@/stores/appStore";
import { Panel, Badge, EmptyState, Button } from "@/components/ui";
import { ConfirmDialog } from "@/components/ui/Modal";
import { toast } from "@/stores/notificationStore";
import { getThemeColors } from "@/utils/theme";
import {
  Trash2,
  Activity,
  TrendingUp,
  TrendingDown,
  Minus,
  ChevronDown,
  ChevronRight,
  ArrowUp,
  ArrowDown,
  FolderTree,
  Eye,
} from "lucide-react";
import { Sparkline } from "@/components/charts/Sparkline";
import { RealtimeChart } from "@/components/charts/RealtimeChart";
import type { MonitoredValue } from "@/types/opcua";
import { errorMessage } from "@/types/opcua";
import { computeStats } from "@/utils/stats";

type SortField = "name" | "value" | "type" | "status" | "timestamp";
type SortDir = "asc" | "desc";

interface SortHeaderProps {
  field: SortField;
  sortField: SortField;
  sortDir: SortDir;
  onSort: (field: SortField) => void;
  children: React.ReactNode;
}

const SortHeader: React.FC<SortHeaderProps> = ({ field, sortField, sortDir, onSort, children }) => (
  <th
    className="px-3 py-2 font-medium cursor-pointer select-none hover:text-iot-text-secondary transition-colors group"
    onClick={() => onSort(field)}
  >
    <span className="inline-flex items-center gap-1">
      {children}
      {sortField === field ? (
        sortDir === "asc" ? (
          <ArrowUp size={10} className="text-iot-cyan" />
        ) : (
          <ArrowDown size={10} className="text-iot-cyan" />
        )
      ) : (
        <ArrowUp size={10} className="text-iot-text-disabled opacity-0 group-hover:opacity-50" />
      )}
    </span>
  </th>
);

export const MonitoredItemsTable: React.FC = () => {
  const themeColors = getThemeColors();
  const { activeConnectionId } = useConnectionStore();
  const {
    subscriptions,
    activeSubscriptionId,
    monitoredValues,
    activePollers,
    removeMonitoredItem,
    getSubStatus,
  } = useSubscriptionStore();

  const [sortField, setSortField] = useState<SortField>("name");
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const [expandedRow, setExpandedRow] = useState<string | null>(null);
  const [removeTarget, setRemoveTarget] = useState<{ id: number; nodeId: string; name: string } | null>(null);

  const activeSub = subscriptions.find((s) => s.id === activeSubscriptionId);
  const monitoredItems = activeSub?.monitored_items ?? [];
  const { setActiveView } = useAppStore();
  const { getSubscriptionName } = useSubscriptionStore();
  const activeSubName = activeSubscriptionId
    ? getSubscriptionName(activeSubscriptionId)
    : "";
  const activeStatus = activeSubscriptionId ? getSubStatus(activeSubscriptionId) : null;
  const activeSubInterval = activeSub?.publishing_interval ?? null;
  const isStale = activeStatus?.lastUpdateAt
    ? Date.now() - activeStatus.lastUpdateAt > Math.max((activeSubInterval ?? 1000) * 4, 5000)
    : false;

  const handleSort = useCallback(
    (field: SortField) => {
      if (sortField === field) {
        setSortDir((d) => (d === "asc" ? "desc" : "asc"));
      } else {
        setSortField(field);
        setSortDir("asc");
      }
    },
    [sortField]
  );

  const sortedItems = useMemo(() => {
      const items = monitoredItems.map((item) => ({
        ...item,
        value: activeSubscriptionId
          ? monitoredValues.get(`${activeSubscriptionId}::${item.node_id}`)
          : undefined,
      }));

    items.sort((a, b) => {
      const dir = sortDir === "asc" ? 1 : -1;
      switch (sortField) {
        case "name":
          return dir * a.display_name.localeCompare(b.display_name);
        case "value": {
          const aVal = a.value?.numericValue ?? 0;
          const bVal = b.value?.numericValue ?? 0;
          return dir * (aVal - bVal);
        }
        case "type":
          return dir * (a.value?.data_type ?? "").localeCompare(b.value?.data_type ?? "");
        case "status":
          return dir * (a.value?.status_code ?? "").localeCompare(b.value?.status_code ?? "");
        case "timestamp": {
          const aT = a.value?.source_timestamp ?? "";
          const bT = b.value?.source_timestamp ?? "";
          return dir * aT.localeCompare(bT);
        }
        default:
          return 0;
      }
    });

    return items;
  }, [monitoredItems, monitoredValues, sortField, sortDir]);

  const handleRemoveItem = async () => {
    if (!activeConnectionId || !activeSubscriptionId || !removeTarget) return;
    try {
      await removeMonitoredItem(activeConnectionId, activeSubscriptionId, removeTarget.id, removeTarget.nodeId);
    } catch (e) {
      toast.error("Remove failed", errorMessage(e));
    }
    setRemoveTarget(null);
  };

  if (!activeSub) {
    return (
      <Panel title="Monitored Items">
        <EmptyState
          icon={<Activity size={24} />}
          title="No Subscription Selected"
          description="Select a subscription from the sidebar, or create a new one to start monitoring"
        />
      </Panel>
    );
  }

  if (monitoredItems.length === 0) {
    return (
      <Panel
        title="Monitored Items"
        headerRight={
          <Badge variant="default">{activeSubName}</Badge>
        }
      >
        <EmptyState
          icon={<Eye size={24} />}
          title="No Monitored Items"
          description={`"${activeSubName}" has no monitored variables yet. Browse the address space to find variables and add them.`}
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
      </Panel>
    );
  }

  return (
    <Panel
      title="Monitored Items"
      noPadding
      headerRight={
        <div className="flex items-center gap-2">
          <Badge variant="default">{activeSubName}</Badge>
          {activeSubscriptionId && activePollers.has(activeSubscriptionId) && (
            <span className="flex items-center gap-1 text-2xs text-iot-cyan">
              <span className="w-1.5 h-1.5 rounded-full bg-iot-cyan animate-pulse-slow" />
              LIVE
            </span>
          )}
          {isStale && <Badge variant="warning">Stale</Badge>}
          {activeStatus?.lastError && <Badge variant="danger">Poll Error</Badge>}
          <Badge variant="info">{monitoredItems.length} items</Badge>
        </div>
      }
    >
      <div className="overflow-auto h-full">
        <table className="w-full">
          <thead className="sticky top-0 bg-iot-bg-surface z-10">
            <tr className="text-left text-2xs text-iot-text-muted uppercase tracking-wider border-b border-iot-border">
              <th className="px-3 py-2 w-6"></th>
              <SortHeader field="name" sortField={sortField} sortDir={sortDir} onSort={handleSort}>Node</SortHeader>
              <SortHeader field="value" sortField={sortField} sortDir={sortDir} onSort={handleSort}>Value</SortHeader>
              <SortHeader field="type" sortField={sortField} sortDir={sortDir} onSort={handleSort}>Type</SortHeader>
              <SortHeader field="status" sortField={sortField} sortDir={sortDir} onSort={handleSort}>Status</SortHeader>
              <th className="px-3 py-2 font-medium">Trend</th>
              <SortHeader field="timestamp" sortField={sortField} sortDir={sortDir} onSort={handleSort}>Timestamp</SortHeader>
              <th className="px-3 py-2 font-medium w-8"></th>
            </tr>
          </thead>
          <tbody>
            {sortedItems.map((item) => {
              const val = item.value;
              const numVal = val?.numericValue;
              const prevVal = val?.previousValue ? parseFloat(val.previousValue) : undefined;
              const trend =
                numVal !== undefined && prevVal !== undefined
                  ? numVal > prevVal
                    ? "up"
                    : numVal < prevVal
                    ? "down"
                    : "flat"
                  : "flat";
              const isExpanded = expandedRow === item.node_id;

              return (
                <React.Fragment key={item.id}>
                  <tr
                    className={clsx(
                      "border-t border-iot-border/30 hover:bg-iot-bg-hover/50 transition-colors cursor-pointer",
                      isExpanded && "bg-iot-bg-hover/30"
                    )}
                    onClick={() => setExpandedRow(isExpanded ? null : item.node_id)}
                  >
                    <td className="px-2 py-2">
                      {isExpanded ? (
                        <ChevronDown size={12} className="text-iot-text-muted" />
                      ) : (
                        <ChevronRight size={12} className="text-iot-text-disabled" />
                      )}
                    </td>
                    <td className="px-3 py-2">
                      <div>
                        <span className="text-xs text-iot-text-primary font-medium">
                          {item.display_name}
                        </span>
                        <span className="block text-2xs font-mono text-iot-text-disabled">
                          {item.node_id}
                        </span>
                      </div>
                    </td>
                    <td className="px-3 py-2">
                      <span className="data-value">
                        {val
                          ? numVal !== undefined
                            ? numVal.toFixed(2)
                            : val.value
                          : "-"}
                      </span>
                    </td>
                    <td className="px-3 py-2">
                      <span className="text-xs text-iot-text-muted">
                        {val?.data_type || "-"}
                      </span>
                    </td>
                    <td className="px-3 py-2">
                      <Badge
                        variant={
                          val?.status_code === "Good" ? "success" : val ? "danger" : "default"
                        }
                      >
                        {val?.status_code || "Pending"}
                      </Badge>
                    </td>
                    <td className="px-3 py-2">
                      {val && val.history.length > 1 ? (
                        <div className="flex items-center gap-1.5">
                          {trend === "up" && <TrendingUp size={12} className="text-iot-cyan" />}
                          {trend === "down" && (
                            <TrendingDown size={12} className="text-iot-amber" />
                          )}
                          {trend === "flat" && (
                            <Minus size={12} className="text-iot-text-muted" />
                          )}
                          <Sparkline
                            data={val.history.slice(-30)}
                            width={80}
                            height={24}
                            color={
                              trend === "up"
                                ? themeColors.cyan
                                : trend === "down"
                                ? themeColors.amber
                                : themeColors.text.muted
                            }
                          />
                        </div>
                      ) : (
                        <span className="text-2xs text-iot-text-disabled">-</span>
                      )}
                    </td>
                    <td className="px-3 py-2">
                      <span className="text-2xs font-mono text-iot-text-muted">
                        {val?.source_timestamp
                          ? new Date(val.source_timestamp).toLocaleTimeString()
                          : "-"}
                      </span>
                    </td>
                    <td className="px-3 py-2">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setRemoveTarget({
                            id: item.id,
                            nodeId: item.node_id,
                            name: item.display_name,
                          });
                        }}
                        className="text-iot-text-disabled hover:text-iot-red transition-colors p-1 rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-iot-border-focus"
                        title="Remove"
                      >
                        <Trash2 size={11} />
                      </button>
                    </td>
                  </tr>

                  {/* Expanded detail row */}
                  {isExpanded && val && (
                    <tr className="border-t border-iot-border/20 bg-iot-bg-base/50">
                      <td colSpan={8} className="px-4 py-3">
                        <ExpandedRowDetail value={val} />
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Remove confirmation */}
      <ConfirmDialog
        open={removeTarget !== null}
        onClose={() => setRemoveTarget(null)}
        onConfirm={handleRemoveItem}
        title="Remove Monitored Item"
        message={`Stop monitoring "${removeTarget?.name || ""}"? Historical data will be lost.`}
        confirmLabel="Remove"
        danger
      />
    </Panel>
  );
};

// ─── Expanded Row Detail ──────────────────────────────────────────

const ExpandedRowDetail: React.FC<{ value: MonitoredValue }> = ({ value }) => {
  const themeColors = getThemeColors();
  const stats = useMemo(() => computeStats(value.history), [value.history]);
  const hasNumericData = value.numericValue !== undefined && value.history.length > 1;
  const chartContainerRef = React.useRef<HTMLDivElement>(null);
  const chartWidth = useContainerWidth(chartContainerRef, 600);

  return (
    <div className="flex gap-4">
      {/* Chart — fixed height, does not stretch to fill */}
      {hasNumericData && (
        <div className="flex-1 min-w-0" ref={chartContainerRef}>
          <RealtimeChart
            data={value.history}
            width={chartWidth}
            height={260}
            color={themeColors.cyan}
            showGrid
            showAxis
            showControls
            label={`${value.display_name} - Real-time`}
          />
        </div>
      )}

      {/* Stats panel on the right */}
      {hasNumericData && (
        <div className="flex flex-col gap-2 min-w-[120px] flex-shrink-0 self-start">
          <div className="bg-iot-bg-elevated rounded p-2 border border-iot-border">
            <span className="data-label text-2xs">Min</span>
            <p className="data-value">{stats.min.toFixed(3)}</p>
          </div>
          <div className="bg-iot-bg-elevated rounded p-2 border border-iot-border">
            <span className="data-label text-2xs">Max</span>
            <p className="data-value">{stats.max.toFixed(3)}</p>
          </div>
          <div className="bg-iot-bg-elevated rounded p-2 border border-iot-border">
            <span className="data-label text-2xs">Average</span>
            <p className="data-value">{stats.avg.toFixed(3)}</p>
          </div>
          <div className="bg-iot-bg-elevated rounded p-2 border border-iot-border">
            <span className="data-label text-2xs">Samples</span>
            <p className="data-value">{stats.count}</p>
          </div>
        </div>
      )}

      {/* Non-numeric fallback */}
      {!hasNumericData && (
        <div className="flex-1">
          <div className="bg-iot-bg-elevated rounded p-3 border border-iot-border">
            <span className="data-label">Current Value</span>
            <p className="data-value mt-1 text-lg">{value.value}</p>
            <p className="text-2xs text-iot-text-disabled mt-1">
              Type: {value.data_type} | Status: {value.status_code}
            </p>
          </div>
        </div>
      )}
    </div>
  );
};
