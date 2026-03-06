import React, { useEffect, useRef, useState } from "react";
import { useBrowserStore } from "@/stores/browserStore";
import { useConnectionStore } from "@/stores/connectionStore";
import { useSubscriptionStore } from "@/stores/subscriptionStore";
import { Panel, Badge, Spinner, EmptyState, Button, Tabs, Input } from "@/components/ui";
import { toast } from "@/stores/notificationStore";
import * as opcua from "@/services/opcua";
import {
  Info,
  Link2,
  Eye,
  FileText,
  RefreshCw,
  Copy,
  Check,
  X,
  Edit3,
  ExternalLink,
} from "lucide-react";

export const NodeAttributePanel: React.FC = () => {
  const { selectedNodeId, selectedNodeDetails, isLoadingDetails, selectNode, navigateToNode } =
    useBrowserStore();
  const { activeConnectionId } = useConnectionStore();
  const {
    subscriptions,
    activeSubscriptionId,
    addMonitoredItem,
    createSubscription,
    startPolling,
  } = useSubscriptionStore();

  const [activeTab, setActiveTab] = useState("attributes");

  // Auto-refresh state
  const [autoRefresh, setAutoRefresh] = useState(false);
  const [refreshInterval, setRefreshInterval] = useState(2000);
  const autoRefreshRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Inline write state
  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState("");
  const [isWriting, setIsWriting] = useState(false);

  // Auto-refresh effect
  useEffect(() => {
    if (autoRefreshRef.current) {
      clearInterval(autoRefreshRef.current);
      autoRefreshRef.current = null;
    }
    if (autoRefresh && activeConnectionId && selectedNodeId) {
      autoRefreshRef.current = setInterval(() => {
        selectNode(activeConnectionId, selectedNodeId);
      }, refreshInterval);
    }
    return () => {
      if (autoRefreshRef.current) clearInterval(autoRefreshRef.current);
    };
  }, [autoRefresh, refreshInterval, activeConnectionId, selectedNodeId]);

  // Stop auto-refresh when node changes
  useEffect(() => {
    setIsEditing(false);
  }, [selectedNodeId]);

  if (!selectedNodeId) {
    return (
      <Panel title="Node Details">
        <EmptyState
          icon={<Info size={24} />}
          title="No Node Selected"
          description="Select a node from the address space tree"
        />
      </Panel>
    );
  }

  if (isLoadingDetails) {
    return (
      <Panel title="Node Details">
        <div className="flex items-center justify-center h-full">
          <Spinner size={24} />
        </div>
      </Panel>
    );
  }

  if (!selectedNodeDetails) {
    return (
      <Panel title="Node Details">
        <EmptyState title="Failed to load details" />
      </Panel>
    );
  }

  const details = selectedNodeDetails;
  const isWritable = (details.access_level ?? 0) & 0x02; // CurrentWrite bit

  const handleMonitor = async () => {
    if (!activeConnectionId) return;
    try {
      let subId = activeSubscriptionId;
      if (!subId || subscriptions.length === 0) {
        subId = await createSubscription(activeConnectionId);
      }
      await addMonitoredItem(activeConnectionId, subId, {
        node_id: details.node_id,
        display_name: details.display_name,
        sampling_interval: 500,
        queue_size: 10,
        discard_oldest: true,
      });
      startPolling(activeConnectionId, subId);
      toast.success("Monitoring", details.display_name);
    } catch (e) {
      toast.error("Monitor failed", String(e));
    }
  };

  const handleCopyNodeId = async () => {
    try {
      await navigator.clipboard.writeText(details.node_id);
      toast.success("Copied", `Node ID: ${details.node_id}`);
    } catch {
      toast.error("Copy failed", "Could not access clipboard");
    }
  };

  const handleRefresh = () => {
    if (activeConnectionId && selectedNodeId) {
      selectNode(activeConnectionId, selectedNodeId);
    }
  };

  const handleInlineWrite = async () => {
    if (!activeConnectionId || !details.data_type) return;
    setIsWriting(true);
    try {
      const result = await opcua.writeValue(activeConnectionId, {
        node_id: details.node_id,
        value: editValue,
        data_type: details.data_type,
      });
      if (result.success) {
        toast.success("Write successful", `${details.display_name} = ${editValue}`);
        setIsEditing(false);
        // Refresh the node details
        handleRefresh();
      } else {
        toast.error("Write failed", result.status_code);
      }
    } catch (e) {
      toast.error("Write failed", String(e));
    } finally {
      setIsWriting(false);
    }
  };

  const handleNavigateToRef = (targetNodeId: string) => {
    if (activeConnectionId) {
      navigateToNode(activeConnectionId, targetNodeId);
    }
  };

  const tabs = [
    { id: "attributes", label: "Attributes", icon: <FileText size={12} /> },
    { id: "references", label: "References", icon: <Link2 size={12} /> },
  ];

  return (
    <Panel
      title="Node Details"
      noPadding
      headerRight={
        <div className="flex items-center gap-1.5">
          {/* Auto-refresh controls */}
          <select
            value={refreshInterval}
            onChange={(e) => setRefreshInterval(Number(e.target.value))}
            className="bg-iot-bg-base border border-iot-border rounded px-1.5 py-0.5 text-2xs text-iot-text-muted focus:outline-none"
          >
            <option value={1000}>1s</option>
            <option value={2000}>2s</option>
            <option value={5000}>5s</option>
          </select>
          <Button
            variant={autoRefresh ? "primary" : "secondary"}
            size="xs"
            onClick={() => setAutoRefresh(!autoRefresh)}
            title={autoRefresh ? "Stop auto-refresh" : "Start auto-refresh"}
          >
            <RefreshCw size={11} className={autoRefresh ? "animate-spin" : ""} />
            {autoRefresh ? "Auto" : "Auto"}
          </Button>
          <Button variant="secondary" size="xs" onClick={handleRefresh} title="Refresh now">
            <RefreshCw size={11} />
          </Button>
          {details.node_class === "Variable" && (
            <Button variant="primary" size="xs" onClick={handleMonitor}>
              <Eye size={11} />
              Monitor
            </Button>
          )}
        </div>
      }
    >
      {/* Node header */}
      <div className="p-3 border-b border-iot-border bg-iot-bg-base/50">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <h3 className="text-sm font-semibold text-iot-text-primary truncate">
              {details.display_name}
            </h3>
            <div className="flex items-center gap-1.5 mt-0.5">
              <p className="text-2xs font-mono text-iot-text-muted">{details.node_id}</p>
              <button
                onClick={handleCopyNodeId}
                className="text-iot-text-disabled hover:text-iot-text-muted transition-colors"
                title="Copy Node ID"
              >
                <Copy size={10} />
              </button>
            </div>
            {details.description && (
              <p className="text-xs text-iot-text-muted mt-1">{details.description}</p>
            )}
          </div>
          <div className="flex gap-1.5 flex-shrink-0">
            <Badge variant={details.status_code === "Good" ? "success" : "danger"}>
              {details.status_code}
            </Badge>
            <Badge>{details.node_class}</Badge>
          </div>
        </div>

        {/* Quick stats for variables */}
        {details.node_class === "Variable" && details.value !== undefined && (
          <div className="mt-3 grid grid-cols-3 gap-3">
            <div className="bg-iot-bg-elevated rounded-md p-2 border border-iot-border">
              <div className="flex items-center justify-between">
                <span className="data-label">Value</span>
                {isWritable ? (
                  !isEditing ? (
                    <button
                      onClick={() => {
                        setEditValue(details.value || "");
                        setIsEditing(true);
                      }}
                      className="text-iot-text-disabled hover:text-iot-cyan transition-colors"
                      title="Edit value"
                    >
                      <Edit3 size={10} />
                    </button>
                  ) : null
                ) : null}
              </div>
              {isEditing ? (
                <div className="flex items-center gap-1 mt-1">
                  <input
                    type="text"
                    value={editValue}
                    onChange={(e) => setEditValue(e.target.value)}
                    className="flex-1 bg-iot-bg-base border border-iot-border-focus rounded px-1.5 py-0.5 text-xs font-mono text-iot-text-primary focus:outline-none"
                    autoFocus
                    onKeyDown={(e) => {
                      if (e.key === "Enter") handleInlineWrite();
                      if (e.key === "Escape") setIsEditing(false);
                    }}
                    disabled={isWriting}
                  />
                  <button
                    onClick={handleInlineWrite}
                    disabled={isWriting}
                    className="text-iot-cyan hover:text-iot-cyan/80 transition-colors disabled:opacity-50"
                  >
                    {isWriting ? <Spinner size={12} /> : <Check size={12} />}
                  </button>
                  <button
                    onClick={() => setIsEditing(false)}
                    className="text-iot-text-disabled hover:text-iot-text-muted transition-colors"
                  >
                    <X size={12} />
                  </button>
                </div>
              ) : (
                <p className="data-value mt-0.5 truncate">{details.value}</p>
              )}
            </div>
            <div className="bg-iot-bg-elevated rounded-md p-2 border border-iot-border">
              <span className="data-label">Data Type</span>
              <p className="text-xs text-iot-text-primary mt-0.5">
                {details.data_type || "Unknown"}
              </p>
            </div>
            <div className="bg-iot-bg-elevated rounded-md p-2 border border-iot-border">
              <span className="data-label">Timestamp</span>
              <p className="text-2xs font-mono text-iot-text-secondary mt-0.5 truncate">
                {details.source_timestamp
                  ? new Date(details.source_timestamp).toLocaleTimeString()
                  : "-"}
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Tabs */}
      <Tabs tabs={tabs} activeTab={activeTab} onTabChange={setActiveTab} />

      {/* Tab content */}
      <div className="overflow-auto flex-1 p-3">
        {activeTab === "attributes" && (
          <div className="space-y-0">
            <table className="w-full">
              <thead>
                <tr className="text-left text-2xs text-iot-text-muted uppercase tracking-wider">
                  <th className="pb-2 pr-4 font-medium">Attribute</th>
                  <th className="pb-2 pr-4 font-medium">Value</th>
                  <th className="pb-2 pr-4 font-medium">Type</th>
                  <th className="pb-2 font-medium">Status</th>
                </tr>
              </thead>
              <tbody className="text-xs">
                {details.attributes.map((attr, i) => (
                  <tr
                    key={i}
                    className="border-t border-iot-border/50 hover:bg-iot-bg-hover/50 transition-colors"
                  >
                    <td className="py-1.5 pr-4 text-iot-text-secondary font-medium">
                      {attr.name}
                    </td>
                    <td className="py-1.5 pr-4 font-mono text-iot-text-primary truncate max-w-[200px]">
                      {attr.value}
                    </td>
                    <td className="py-1.5 pr-4 text-iot-text-muted">{attr.data_type || "-"}</td>
                    <td className="py-1.5">
                      <Badge variant={attr.status === "Good" ? "success" : "danger"}>
                        {attr.status}
                      </Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {activeTab === "references" && (
          <div className="space-y-0">
            {details.references.length === 0 ? (
              <EmptyState title="No references" />
            ) : (
              <table className="w-full">
                <thead>
                  <tr className="text-left text-2xs text-iot-text-muted uppercase tracking-wider">
                    <th className="pb-2 pr-4 font-medium">Direction</th>
                    <th className="pb-2 pr-4 font-medium">Type</th>
                    <th className="pb-2 pr-4 font-medium">Target</th>
                    <th className="pb-2 font-medium">Class</th>
                  </tr>
                </thead>
                <tbody className="text-xs">
                  {details.references.map((ref, i) => (
                    <tr
                      key={i}
                      className="border-t border-iot-border/50 hover:bg-iot-bg-hover/50 transition-colors"
                    >
                      <td className="py-1.5 pr-4">
                        <Badge variant={ref.is_forward ? "success" : "info"}>
                          {ref.is_forward ? "Forward" : "Inverse"}
                        </Badge>
                      </td>
                      <td className="py-1.5 pr-4 text-iot-text-secondary">
                        {ref.reference_type}
                      </td>
                      <td className="py-1.5 pr-4">
                        <button
                          className="group flex items-center gap-1 text-left hover:text-iot-cyan transition-colors"
                          onClick={() => handleNavigateToRef(ref.target_node_id)}
                          title={`Navigate to ${ref.target_node_id}`}
                        >
                          <ExternalLink
                            size={10}
                            className="text-iot-text-disabled group-hover:text-iot-cyan transition-colors"
                          />
                          <span className="text-iot-text-primary group-hover:text-iot-cyan">
                            {ref.target_display_name}
                          </span>
                          <span className="text-2xs font-mono text-iot-text-disabled ml-1">
                            {ref.target_node_id}
                          </span>
                        </button>
                      </td>
                      <td className="py-1.5 text-iot-text-muted">{ref.target_node_class}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}
      </div>
    </Panel>
  );
};
