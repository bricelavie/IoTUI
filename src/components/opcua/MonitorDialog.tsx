import React, { useState, useMemo } from "react";
import { useConnectionStore } from "@/stores/connectionStore";
import { useSubscriptionStore } from "@/stores/subscriptionStore";
import { Modal } from "@/components/ui/Modal";
import { Button, Badge } from "@/components/ui";
import { toast } from "@/stores/notificationStore";
import { useSettingsStore } from "@/stores/settingsStore";
import {
  Eye,
  Plus,
  AlertTriangle,
  Activity,
  Clock,
  Layers,
} from "lucide-react";

interface MonitorDialogProps {
  open: boolean;
  onClose: () => void;
  nodeId: string;
  displayName: string;
}

export const MonitorDialog: React.FC<MonitorDialogProps> = ({
  open,
  onClose,
  nodeId,
  displayName,
}) => {
  const { activeConnectionId } = useConnectionStore();
  const {
    subscriptions,
    activeSubscriptionId,
    subscriptionMeta,
    createSubscription,
    addMonitoredItem,
    startPolling,
    getSubscriptionsForNode,
  } = useSubscriptionStore();

  const defaultPublishingInterval = useSettingsStore((s) => s.defaultPublishingInterval);
  const defaultSamplingInterval = useSettingsStore((s) => s.defaultSamplingInterval);
  const defaultQueueSize = useSettingsStore((s) => s.defaultQueueSize);

  // "existing" = pick an existing sub, "new" = create a new one
  const [mode, setMode] = useState<"existing" | "new">(
    subscriptions.length === 0 ? "new" : "existing"
  );
  const [selectedSubId, setSelectedSubId] = useState<number | null>(
    activeSubscriptionId
  );
  const [newSubName, setNewSubName] = useState("");
  const [publishingInterval, setPublishingInterval] = useState(String(defaultPublishingInterval));
  const [samplingInterval, setSamplingInterval] = useState(String(defaultSamplingInterval));
  const [queueSize, setQueueSize] = useState(String(defaultQueueSize));
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Reset state when dialog opens
  React.useEffect(() => {
    if (open) {
      setMode(subscriptions.length === 0 ? "new" : "existing");
      setSelectedSubId(activeSubscriptionId ?? subscriptions[0]?.id ?? null);
      setNewSubName("");
      setPublishingInterval(String(defaultPublishingInterval));
      setSamplingInterval(String(defaultSamplingInterval));
      setQueueSize(String(defaultQueueSize));
      setIsSubmitting(false);
    }
  }, [open]);

  // Check for duplicates
  const existingMonitors = useMemo(
    () => getSubscriptionsForNode(nodeId),
    [nodeId, subscriptions]
  );

  const isDuplicate =
    mode === "existing" &&
    selectedSubId !== null &&
    existingMonitors.some((m) => m.subId === selectedSubId);

  const handleSubmit = async () => {
    if (!activeConnectionId) return;
    setIsSubmitting(true);

    try {
      let subId: number;

      if (mode === "new") {
        const interval = parseInt(publishingInterval) || 500;
        subId = await createSubscription(
          activeConnectionId,
          { publishing_interval: interval },
          newSubName || undefined
        );
      } else {
        subId = selectedSubId!;
      }

      await addMonitoredItem(activeConnectionId, subId, {
        node_id: nodeId,
        display_name: displayName,
        sampling_interval: parseInt(samplingInterval) || 500,
        queue_size: parseInt(queueSize) || 10,
        discard_oldest: true,
      });

      startPolling(activeConnectionId, subId);
      toast.success("Monitoring", displayName);
      onClose();
    } catch (e) {
      toast.error("Monitor failed", String(e));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Monitor Variable"
      width="md"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={isSubmitting}>
            Cancel
          </Button>
          <Button
            variant="primary"
            onClick={handleSubmit}
            loading={isSubmitting}
            disabled={isDuplicate || (mode === "existing" && selectedSubId === null)}
          >
            <Eye size={12} />
            Start Monitoring
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        {/* Target node info */}
        <div className="bg-iot-bg-base rounded-lg border border-iot-border p-3">
          <div className="flex items-center justify-between">
            <div className="min-w-0">
              <p className="text-sm font-medium text-iot-text-primary truncate">
                {displayName}
              </p>
              <p className="text-2xs font-mono text-iot-text-muted mt-0.5">
                {nodeId}
              </p>
            </div>
            <Badge variant="info">Variable</Badge>
          </div>

          {/* Already monitored warning */}
          {existingMonitors.length > 0 && (
            <div className="mt-2 pt-2 border-t border-iot-border/50">
              <div className="flex items-start gap-1.5 text-2xs text-iot-amber">
                <Eye size={11} className="mt-0.5 flex-shrink-0" />
                <span>
                  Already monitored in:{" "}
                  {existingMonitors.map((m) => m.name).join(", ")}
                </span>
              </div>
            </div>
          )}
        </div>

        {/* Subscription selection */}
        <div>
          <label className="text-xs font-medium text-iot-text-secondary block mb-2">
            <Activity size={11} className="inline mr-1.5" />
            Subscription
          </label>

          {/* Toggle between existing / new */}
          <div className="flex gap-1 mb-3">
            <button
              className={`flex-1 px-3 py-1.5 rounded text-xs font-medium border transition-all ${
                mode === "existing" && subscriptions.length > 0
                  ? "bg-iot-cyan/10 border-iot-cyan/30 text-iot-cyan"
                  : "bg-iot-bg-elevated border-iot-border text-iot-text-muted hover:text-iot-text-secondary"
              } ${subscriptions.length === 0 ? "opacity-40 cursor-not-allowed" : "cursor-pointer"}`}
              onClick={() => subscriptions.length > 0 && setMode("existing")}
              disabled={subscriptions.length === 0}
            >
              <Layers size={11} className="inline mr-1" />
              Use Existing
              {subscriptions.length > 0 && (
                <span className="ml-1 opacity-60">({subscriptions.length})</span>
              )}
            </button>
            <button
              className={`flex-1 px-3 py-1.5 rounded text-xs font-medium border transition-all cursor-pointer ${
                mode === "new"
                  ? "bg-iot-cyan/10 border-iot-cyan/30 text-iot-cyan"
                  : "bg-iot-bg-elevated border-iot-border text-iot-text-muted hover:text-iot-text-secondary"
              }`}
              onClick={() => setMode("new")}
            >
              <Plus size={11} className="inline mr-1" />
              Create New
            </button>
          </div>

          {/* Existing subscription picker */}
          {mode === "existing" && subscriptions.length > 0 && (
            <div className="space-y-1.5">
              {subscriptions.map((sub) => {
                const name =
                  subscriptionMeta.get(sub.id)?.name ||
                  `Subscription #${sub.id}`;
                const isSelected = selectedSubId === sub.id;
                const wouldDuplicate = existingMonitors.some(
                  (m) => m.subId === sub.id
                );

                return (
                  <button
                    key={sub.id}
                    className={`w-full text-left px-3 py-2 rounded border transition-all ${
                      isSelected
                        ? "bg-iot-cyan/10 border-iot-cyan/30"
                        : "bg-iot-bg-elevated border-iot-border hover:border-iot-border-light"
                    }`}
                    onClick={() => setSelectedSubId(sub.id)}
                  >
                    <div className="flex items-center justify-between">
                      <span
                        className={`text-xs font-medium ${
                          isSelected
                            ? "text-iot-cyan"
                            : "text-iot-text-secondary"
                        }`}
                      >
                        {name}
                      </span>
                      <div className="flex items-center gap-1.5">
                        <Badge variant="default">
                          {sub.publishing_interval}ms
                        </Badge>
                        <Badge variant="info">
                          {sub.monitored_items.length} items
                        </Badge>
                      </div>
                    </div>
                    {wouldDuplicate && (
                      <div className="flex items-center gap-1 mt-1 text-2xs text-iot-amber">
                        <AlertTriangle size={10} />
                        Already monitoring this variable
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
          )}

          {/* New subscription form */}
          {mode === "new" && (
            <div className="space-y-3 bg-iot-bg-base rounded-lg border border-iot-border p-3">
              <div>
                <label className="text-2xs text-iot-text-muted font-medium block mb-1">
                  Name (optional)
                </label>
                <input
                  type="text"
                  value={newSubName}
                  onChange={(e) => setNewSubName(e.target.value)}
                  placeholder={`Subscription ${useSubscriptionStore.getState().nextSubNumber}`}
                  className="w-full bg-iot-bg-elevated border border-iot-border rounded px-2.5 py-1.5 text-xs text-iot-text-primary placeholder:text-iot-text-disabled focus:outline-none focus:border-iot-border-focus transition-colors"
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
                    min="100"
                    step="100"
                    className="w-24 bg-iot-bg-elevated border border-iot-border rounded px-2.5 py-1.5 text-xs font-mono text-iot-text-primary focus:outline-none focus:border-iot-border-focus transition-colors"
                  />
                  <span className="text-2xs text-iot-text-disabled">ms</span>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Monitoring parameters */}
        <div>
          <label className="text-xs font-medium text-iot-text-secondary block mb-2">
            <Clock size={11} className="inline mr-1.5" />
            Monitoring Parameters
          </label>
          <div className="grid grid-cols-2 gap-3 bg-iot-bg-base rounded-lg border border-iot-border p-3">
            <div>
              <label className="text-2xs text-iot-text-muted font-medium block mb-1">
                Sampling Interval
              </label>
              <div className="flex items-center gap-1.5">
                <input
                  type="number"
                  value={samplingInterval}
                  onChange={(e) => setSamplingInterval(e.target.value)}
                  min="100"
                  step="100"
                  className="w-full bg-iot-bg-elevated border border-iot-border rounded px-2.5 py-1.5 text-xs font-mono text-iot-text-primary focus:outline-none focus:border-iot-border-focus transition-colors"
                />
                <span className="text-2xs text-iot-text-disabled">ms</span>
              </div>
            </div>
            <div>
              <label className="text-2xs text-iot-text-muted font-medium block mb-1">
                Queue Size
              </label>
              <input
                type="number"
                value={queueSize}
                onChange={(e) => setQueueSize(e.target.value)}
                min="1"
                max="100"
                className="w-full bg-iot-bg-elevated border border-iot-border rounded px-2.5 py-1.5 text-xs font-mono text-iot-text-primary focus:outline-none focus:border-iot-border-focus transition-colors"
              />
            </div>
          </div>
        </div>

        {/* Duplicate warning banner */}
        {isDuplicate && (
          <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-iot-amber/10 border border-iot-amber/20 text-xs text-iot-amber">
            <AlertTriangle size={14} className="flex-shrink-0" />
            <span>
              This variable is already monitored in the selected subscription.
              Choose a different subscription or create a new one.
            </span>
          </div>
        )}
      </div>
    </Modal>
  );
};
