import React, { useState } from "react";
import { useConnectionStore } from "@/stores/connectionStore";
import { useSubscriptionStore } from "@/stores/subscriptionStore";
import { Button, Badge } from "@/components/ui";
import { ConfirmDialog } from "@/components/ui/Modal";
import { toast } from "@/stores/notificationStore";
import { Plus, Trash2, Play, Pause, Activity } from "lucide-react";

export const SubscriptionManager: React.FC = () => {
  const { activeConnectionId } = useConnectionStore();
  const {
    subscriptions,
    activeSubscriptionId,
    isPolling,
    createSubscription,
    deleteSubscription,
    startPolling,
    stopPolling,
  } = useSubscriptionStore();

  const [publishingInterval, setPublishingInterval] = useState("500");
  const [isCreating, setIsCreating] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<number | null>(null);

  const handleCreateSubscription = async () => {
    if (!activeConnectionId) return;
    setIsCreating(true);
    try {
      const subId = await createSubscription(activeConnectionId, {
        publishing_interval: parseInt(publishingInterval) || 500,
      });
      startPolling(activeConnectionId, subId);
    } catch (e) {
      toast.error("Failed to create subscription", String(e));
    }
    setIsCreating(false);
  };

  const handleDeleteSubscription = async (subId: number) => {
    if (!activeConnectionId) return;
    try {
      await deleteSubscription(activeConnectionId, subId);
    } catch (e) {
      toast.error("Failed to delete subscription", String(e));
    }
    setDeleteTarget(null);
  };

  const handleTogglePolling = (subId: number) => {
    if (!activeConnectionId) return;
    if (isPolling && activeSubscriptionId === subId) {
      stopPolling();
      toast.info("Polling paused");
    } else {
      startPolling(activeConnectionId, subId);
      toast.info("Polling resumed");
    }
  };

  const targetSub = subscriptions.find((s) => s.id === deleteTarget);

  return (
    <div className="p-3">
      <div className="flex items-center gap-3 flex-wrap">
        {/* Create new subscription */}
        <div className="flex items-center gap-2">
          <Activity size={14} className="text-iot-cyan" />
          <span className="text-xs font-semibold text-iot-text-secondary uppercase tracking-wider">
            Subscriptions
          </span>
        </div>

        <div className="flex items-center gap-2 ml-auto">
          <div className="flex items-center gap-1.5">
            <label className="text-2xs text-iot-text-muted">Interval:</label>
            <input
              type="number"
              value={publishingInterval}
              onChange={(e) => setPublishingInterval(e.target.value)}
              className="w-16 bg-iot-bg-base border border-iot-border rounded px-2 py-0.5 text-2xs font-mono text-iot-text-primary focus:outline-none focus:border-iot-border-focus transition-colors"
              min="100"
              step="100"
            />
            <span className="text-2xs text-iot-text-disabled">ms</span>
          </div>
          <Button
            variant="primary"
            size="xs"
            onClick={handleCreateSubscription}
            loading={isCreating}
          >
            <Plus size={11} />
            New
          </Button>
        </div>
      </div>

      {/* Active subscriptions */}
      {subscriptions.length > 0 && (
        <div className="flex items-center gap-2 mt-2 flex-wrap">
          {subscriptions.map((sub) => (
            <div
              key={sub.id}
              className={`flex items-center gap-2 px-2 py-1 rounded border text-xs transition-all ${
                activeSubscriptionId === sub.id
                  ? "bg-iot-cyan/10 border-iot-cyan/30 text-iot-cyan"
                  : "bg-iot-bg-elevated border-iot-border text-iot-text-secondary"
              }`}
            >
              <span className="font-mono">#{sub.id}</span>
              <Badge variant="default">{sub.publishing_interval}ms</Badge>
              <Badge variant="info">{sub.monitored_items.length} items</Badge>

              <button
                onClick={() => handleTogglePolling(sub.id)}
                className="p-0.5 hover:bg-iot-bg-hover rounded transition-colors"
                title={isPolling && activeSubscriptionId === sub.id ? "Pause" : "Start"}
              >
                {isPolling && activeSubscriptionId === sub.id ? (
                  <Pause size={11} />
                ) : (
                  <Play size={11} />
                )}
              </button>

              <button
                onClick={() => setDeleteTarget(sub.id)}
                className="p-0.5 hover:text-iot-red transition-colors"
                title="Delete"
              >
                <Trash2 size={11} />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Delete confirmation */}
      <ConfirmDialog
        open={deleteTarget !== null}
        onClose={() => setDeleteTarget(null)}
        onConfirm={() => deleteTarget !== null && handleDeleteSubscription(deleteTarget)}
        title="Delete Subscription"
        message={`Delete subscription #${deleteTarget}${
          targetSub ? ` with ${targetSub.monitored_items.length} monitored items` : ""
        }? This will stop monitoring all items in this subscription.`}
        confirmLabel="Delete"
        danger
      />
    </div>
  );
};
