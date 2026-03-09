import React, { useState } from "react";
import { useConnectionStore } from "@/stores/connectionStore";
import { useSubscriptionStore } from "@/stores/subscriptionStore";
import { Button, Badge, EmptyState, Tooltip } from "@/components/ui";
import { ConfirmDialog } from "@/components/ui/Modal";
import { errorMessage } from "@/types/opcua";
import { toast } from "@/stores/notificationStore";
import {
  Plus,
  Trash2,
  Play,
  Pause,
  Activity,
  Clock,
  Eye,
  Edit3,
  ChevronRight,
  Radio,
} from "lucide-react";

export const SubscriptionManager: React.FC = () => {
  const { activeConnectionId } = useConnectionStore();
  const {
    subscriptions,
    activeSubscriptionId,
    activePollers,
    subscriptionMeta,
    createSubscription,
    deleteSubscription,
    startPolling,
    stopPolling,
    renameSubscription,
    getSubscriptionName,
    getSubStatus,
    setActiveSubscriptionId,
  } = useSubscriptionStore();
  const [publishingInterval, setPublishingInterval] = useState("500");
  const [newSubName, setNewSubName] = useState("");
  const [isCreating, setIsCreating] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<number | null>(null);
  const [showNewForm, setShowNewForm] = useState(false);
  const [editingName, setEditingName] = useState<number | null>(null);
  const [editNameValue, setEditNameValue] = useState("");

  const handleCreateSubscription = async () => {
    if (!activeConnectionId) return;
    setIsCreating(true);
    try {
      const subId = await createSubscription(
        activeConnectionId,
        { publishing_interval: parseInt(publishingInterval) || 500 },
        newSubName || undefined
      );
      startPolling(activeConnectionId, subId);
      setShowNewForm(false);
      setNewSubName("");
      setPublishingInterval("500");
    } catch (e) {
      toast.error("Failed to create subscription", errorMessage(e));
    }
    setIsCreating(false);
  };

  const handleDeleteSubscription = async (subId: number) => {
    if (!activeConnectionId) return;
    try {
      await deleteSubscription(activeConnectionId, subId);
    } catch (e) {
      toast.error("Failed to delete subscription", errorMessage(e));
    }
    setDeleteTarget(null);
  };

  const handleTogglePolling = (subId: number) => {
    if (!activeConnectionId) return;
    if (activePollers.has(subId)) {
      stopPolling(subId);
      toast.info("Polling paused");
    } else {
      startPolling(activeConnectionId, subId);
      toast.info("Polling resumed");
    }
  };

  const handleSelectSubscription = (subId: number) => {
    if (!activeConnectionId) return;
    setActiveSubscriptionId(subId);
    if (!activePollers.has(subId) || activeSubscriptionId !== subId) {
      startPolling(activeConnectionId, subId);
    }
  };

  const handleStartRename = (subId: number) => {
    setEditingName(subId);
    setEditNameValue(getSubscriptionName(subId));
  };

  const handleFinishRename = () => {
    if (editingName !== null && editNameValue.trim()) {
      renameSubscription(editingName, editNameValue.trim());
    }
    setEditingName(null);
  };

  const targetSub = subscriptions.find((s) => s.id === deleteTarget);
  const targetSubName = deleteTarget
    ? subscriptionMeta.get(deleteTarget)?.name || `#${deleteTarget}`
    : "";

  return (
    <div className="flex flex-col h-full bg-iot-bg-surface">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2.5 border-b border-iot-border flex-shrink-0">
        <div className="flex items-center gap-2">
          <Activity size={14} className="text-iot-cyan" />
          <span className="text-xs font-semibold text-iot-text-secondary uppercase tracking-wider">
            Subscriptions
          </span>
          {subscriptions.length > 0 && (
            <Badge variant="info">{subscriptions.length}</Badge>
          )}
        </div>
        <Button
          variant="primary"
          size="xs"
          onClick={() => setShowNewForm(!showNewForm)}
        >
          <Plus size={11} />
          New
        </Button>
      </div>

      {/* New subscription form */}
      {showNewForm && (
        <div className="p-3 border-b border-iot-border bg-iot-bg-base/50 animate-fade-in">
          <div className="space-y-2.5">
            <div>
              <label className="text-2xs text-iot-text-muted font-medium block mb-1">
                Name
              </label>
              <input
                type="text"
                value={newSubName}
                onChange={(e) => setNewSubName(e.target.value)}
                placeholder={`Subscription ${useSubscriptionStore.getState().nextSubNumber}`}
                className="w-full bg-iot-bg-elevated border border-iot-border rounded px-2.5 py-1.5 text-xs text-iot-text-primary placeholder:text-iot-text-disabled focus:outline-none focus:border-iot-border-focus focus:ring-1 focus:ring-iot-border-focus/30 transition-colors duration-150"
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleCreateSubscription();
                  if (e.key === "Escape") setShowNewForm(false);
                }}
              />
            </div>
            <div>
              <label className="text-2xs text-iot-text-muted font-medium block mb-1">
                <Clock size={10} className="inline mr-1" />
                Publishing Interval
              </label>
              <div className="flex items-center gap-1.5">
                <input
                  type="number"
                  value={publishingInterval}
                  onChange={(e) => setPublishingInterval(e.target.value)}
                  className="w-24 bg-iot-bg-elevated border border-iot-border rounded px-2.5 py-1.5 text-xs font-mono text-iot-text-primary focus:outline-none focus:border-iot-border-focus focus:ring-1 focus:ring-iot-border-focus/30 transition-colors duration-150"
                  min="100"
                  step="100"
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleCreateSubscription();
                  }}
                />
                <span className="text-2xs text-iot-text-disabled">ms</span>
              </div>
            </div>
            <div className="flex gap-2 pt-1">
              <Button
                variant="primary"
                size="xs"
                onClick={handleCreateSubscription}
                loading={isCreating}
              >
                <Plus size={11} />
                Create
              </Button>
              <Button
                variant="secondary"
                size="xs"
                onClick={() => setShowNewForm(false)}
              >
                Cancel
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Subscription list */}
      <div className="flex-1 overflow-auto">
        {subscriptions.length === 0 && !showNewForm ? (
          <EmptyState
            icon={<Activity size={24} />}
            title="No Subscriptions"
            description="Create a subscription to start monitoring OPC UA variables"
            action={
              <Button
                variant="primary"
                size="sm"
                onClick={() => setShowNewForm(true)}
              >
                <Plus size={12} />
                Create Subscription
              </Button>
            }
          />
        ) : (
          <div className="p-2 space-y-1">
            {subscriptions.map((sub) => {
              const name =
                subscriptionMeta.get(sub.id)?.name ||
                `Subscription #${sub.id}`;
              const isActive = activeSubscriptionId === sub.id;
              const isActivePolling = activePollers.has(sub.id);
              const isRenaming = editingName === sub.id;
              const status = getSubStatus(sub.id);
              const isStale = status.lastUpdateAt
                ? Date.now() - status.lastUpdateAt > Math.max(sub.publishing_interval * 4, 5000)
                : false;

              return (
                <div
                  key={sub.id}
                  className={`rounded-lg border transition-all cursor-pointer ${
                    isActive
                      ? "bg-iot-cyan/5 border-iot-cyan/30 shadow-sm shadow-iot-cyan/5"
                      : "bg-iot-bg-elevated border-iot-border hover:border-iot-border-light"
                  }`}
                  onClick={() => handleSelectSubscription(sub.id)}
                >
                  {/* Subscription card content */}
                  <div className="px-3 py-2.5">
                    {/* Top row: name + controls */}
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2 min-w-0 flex-1">
                        {/* Active indicator */}
                        {isActive && (
                          <div className="flex-shrink-0">
                            {isActivePolling ? (
                              <Radio size={12} className="text-iot-cyan animate-pulse-slow" />
                            ) : (
                              <Radio size={12} className="text-iot-cyan/50" />
                            )}
                          </div>
                        )}
                        {!isActive && (
                          <ChevronRight size={12} className="text-iot-text-disabled flex-shrink-0" />
                        )}

                        {/* Name (editable) */}
                        {isRenaming ? (
                          <div className="flex items-center gap-1 flex-1 min-w-0">
                            <input
                              type="text"
                              value={editNameValue}
                              onChange={(e) =>
                                setEditNameValue(e.target.value)
                              }
                              className="flex-1 bg-iot-bg-base border border-iot-border-focus rounded px-2 py-0.5 text-xs text-iot-text-primary focus:outline-none focus:ring-1 focus:ring-iot-border-focus/30 transition-colors duration-150 min-w-0"
                              autoFocus
                              onClick={(e) => e.stopPropagation()}
                              onKeyDown={(e) => {
                                if (e.key === "Enter") handleFinishRename();
                                if (e.key === "Escape") setEditingName(null);
                              }}
                              onBlur={handleFinishRename}
                            />
                          </div>
                        ) : (
                          <span
                            className={`text-xs font-medium truncate ${
                              isActive
                                ? "text-iot-cyan"
                                : "text-iot-text-secondary"
                            }`}
                          >
                            {name}
                          </span>
                        )}
                      </div>

                      {/* Controls */}
                      <div
                        className="flex items-center gap-0.5 flex-shrink-0"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <Tooltip content="Rename">
                          <button
                            onClick={() => handleStartRename(sub.id)}
                            className="p-1 text-iot-text-disabled hover:text-iot-text-muted transition-colors rounded hover:bg-iot-bg-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-iot-border-focus focus-visible:ring-offset-1 focus-visible:ring-offset-iot-bg-base"
                          >
                            <Edit3 size={11} />
                          </button>
                        </Tooltip>
                        <Tooltip content={isActivePolling ? "Pause polling" : "Start polling"}>
                          <button
                            onClick={() => handleTogglePolling(sub.id)}
                            className={`p-1 rounded transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-iot-border-focus focus-visible:ring-offset-1 focus-visible:ring-offset-iot-bg-base ${
                              isActivePolling
                                ? "text-iot-cyan hover:text-iot-cyan/70 hover:bg-iot-cyan/10"
                                : "text-iot-text-disabled hover:text-iot-text-muted hover:bg-iot-bg-hover"
                            }`}
                          >
                            {isActivePolling ? (
                              <Pause size={11} />
                            ) : (
                              <Play size={11} />
                            )}
                          </button>
                        </Tooltip>
                        <Tooltip content="Delete subscription">
                          <button
                            onClick={() => setDeleteTarget(sub.id)}
                            className="p-1 text-iot-text-disabled hover:text-iot-red transition-colors rounded hover:bg-iot-red/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-iot-border-focus focus-visible:ring-offset-1 focus-visible:ring-offset-iot-bg-base"
                          >
                            <Trash2 size={11} />
                          </button>
                        </Tooltip>
                      </div>
                    </div>

                    {/* Bottom row: metadata badges + item preview */}
                    <div className="flex items-center gap-2 mt-1.5 ml-5">
                      <Badge variant="default">
                        <Clock size={9} className="mr-0.5" />
                        {sub.publishing_interval}ms
                      </Badge>
                      <Badge variant={sub.monitored_items.length > 0 ? "info" : "default"}>
                        <Eye size={9} className="mr-0.5" />
                        {sub.monitored_items.length} items
                      </Badge>
                      {isStale && <Badge variant="warning">Stale</Badge>}
                      {status.lastError && <Badge variant="danger">Poll Error</Badge>}
                    </div>

                    {/* Item preview (show first few items) */}
                    {sub.monitored_items.length > 0 && isActive && (
                      <div className="mt-2 ml-5 space-y-0.5">
                        {sub.monitored_items.slice(0, 4).map((item) => (
                          <div
                            key={item.id}
                            className="text-2xs text-iot-text-muted truncate flex items-center gap-1"
                          >
                            <span className="w-1 h-1 rounded-full bg-iot-cyan/40 flex-shrink-0" />
                            {item.display_name}
                          </div>
                        ))}
                        {sub.monitored_items.length > 4 && (
                          <div className="text-2xs text-iot-text-disabled">
                            +{sub.monitored_items.length - 4} more
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Delete confirmation */}
      <ConfirmDialog
        open={deleteTarget !== null}
        onClose={() => setDeleteTarget(null)}
        onConfirm={() =>
          deleteTarget !== null && handleDeleteSubscription(deleteTarget)
        }
        title="Delete Subscription"
        message={`Delete "${targetSubName}"${
          targetSub
            ? ` with ${targetSub.monitored_items.length} monitored items`
            : ""
        }? This will stop monitoring all items in this subscription.`}
        confirmLabel="Delete"
        danger
      />
    </div>
  );
};
