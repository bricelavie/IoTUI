import React, { useState, useMemo } from "react";
import { useMqttSubscriptionStore } from "@/stores/mqttSubscriptionStore";
import { useMqttConnectionStore } from "@/stores/mqttConnectionStore";
import { Button, Input, Select, Badge, EmptyState, Tooltip } from "@/components/ui";
import { ConfirmDialog } from "@/components/ui/Modal";
import { toast } from "@/stores/notificationStore";
import { errorMessage } from "@/utils/errors";
import { calculateMessageRate } from "@/utils/mqtt";
import type { MqttQoS } from "@/types/mqtt";
import {
  Plus,
  Trash2,
  Activity,
  Filter,
  Eraser,
} from "lucide-react";

const QOS_OPTIONS = [
  { value: "0", label: "QoS 0" },
  { value: "1", label: "QoS 1" },
  { value: "2", label: "QoS 2" },
];

/**
 * Check whether an MQTT topic matches a subscription filter per MQTT 3.1.1 Section 4.7.
 * - `+` matches exactly one topic level
 * - `#` matches zero or more remaining levels (must be last segment)
 */
function matchesMqttFilter(filter: string, topic: string): boolean {
  const filterParts = filter.split("/");
  const topicParts = topic.split("/");
  for (let i = 0; i < filterParts.length; i++) {
    if (filterParts[i] === "#") return true; // # matches rest
    if (i >= topicParts.length) return false;
    if (filterParts[i] !== "+" && filterParts[i] !== topicParts[i]) return false;
  }
  return filterParts.length === topicParts.length;
}

export const MqttSubscriptionManager: React.FC = () => {
  const { activeConnectionId } = useMqttConnectionStore();
  const {
    subscriptions,
    subscribe,
    unsubscribe,
    messages,
    clearMessages,
  } = useMqttSubscriptionStore();

  const [topicFilter, setTopicFilter] = useState("#");
  const [qos, setQos] = useState<MqttQoS>("0");
  const [isSubscribing, setIsSubscribing] = useState(false);
  const [unsubTarget, setUnsubTarget] = useState<{ id: number; topic: string } | null>(null);
  const [confirmClear, setConfirmClear] = useState(false);

  // Calculate per-subscription message rates
  const subRates = useMemo(() => {
    const rates = new Map<string, number>();
    const subTimestamps = new Map<string, string[]>();

    for (const sub of subscriptions) {
      subTimestamps.set(sub.topic_filter, []);
    }

    for (const msg of messages) {
      for (const sub of subscriptions) {
        if (matchesMqttFilter(sub.topic_filter, msg.topic)) {
          const ts = subTimestamps.get(sub.topic_filter) ?? [];
          ts.push(msg.timestamp);
          subTimestamps.set(sub.topic_filter, ts);
        }
      }
    }

    for (const [filter, timestamps] of subTimestamps) {
      rates.set(filter, calculateMessageRate(timestamps, 10));
    }
    return rates;
  }, [messages, subscriptions]);

  const totalRate = useMemo(() => {
    const timestamps = messages.map((m) => m.timestamp);
    return calculateMessageRate(timestamps, 10);
  }, [messages]);

  const handleSubscribe = async () => {
    if (!activeConnectionId || !topicFilter.trim()) return;
    setIsSubscribing(true);
    try {
      await subscribe(activeConnectionId, topicFilter.trim(), qos);
    } catch (e) {
      toast.error("Subscribe failed", errorMessage(e));
    } finally {
      setIsSubscribing(false);
    }
  };

  const handleUnsubscribe = async (subId: number) => {
    if (!activeConnectionId) return;
    try {
      await unsubscribe(activeConnectionId, subId);
    } catch (e) {
      toast.error("Unsubscribe failed", errorMessage(e));
    }
  };

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="flex items-center gap-2 px-3 py-2 border-b border-iot-border flex-shrink-0">
        <Activity size={14} className="text-iot-cyan" />
        <span className="text-xs font-semibold text-iot-text-secondary uppercase tracking-wider">
          Subscriptions
        </span>
        <Badge variant="info">{subscriptions.length}</Badge>
      </div>

      {/* Subscribe form */}
      <div className="p-3 border-b border-iot-border flex-shrink-0 space-y-2">
        <Input
          value={topicFilter}
          onChange={(e) => setTopicFilter(e.target.value)}
          placeholder="topic/filter/#"
          className="font-mono text-xs"
          onKeyDown={(e) => e.key === "Enter" && handleSubscribe()}
        />
        <div className="flex gap-2">
          <Select
            options={QOS_OPTIONS}
            value={qos}
            onChange={(e) => setQos(e.target.value as MqttQoS)}
            className="text-xs"
          />
          <Button
            variant="primary"
            size="sm"
            onClick={handleSubscribe}
            loading={isSubscribing}
            disabled={!activeConnectionId || !topicFilter.trim()}
            className="flex-1"
          >
            <Plus size={12} />
            Subscribe
          </Button>
        </div>
      </div>

      {/* Subscription list */}
      <div className="flex-1 overflow-auto py-1">
        {subscriptions.length === 0 ? (
          <EmptyState
            icon={<Filter size={24} />}
            title="No Subscriptions"
            description="Subscribe to a topic filter to receive messages"
          />
        ) : (
          <div className="space-y-1 px-2">
            {subscriptions.map((sub) => {
              const rate = subRates.get(sub.topic_filter) ?? 0;
              return (
                <div
                  key={sub.id}
                  className="flex items-center gap-2 p-2 rounded bg-iot-bg-base border border-iot-border hover:border-iot-border-light transition-colors group"
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-mono text-iot-text-primary truncate">
                      {sub.topic_filter}
                    </p>
                    <div className="flex items-center gap-2 mt-0.5">
                      <Badge variant="default">QoS {sub.qos}</Badge>
                      <Badge variant={sub.active ? "success" : "warning"}>
                        {sub.active ? "active" : "inactive"}
                      </Badge>
                      <span className="text-2xs text-iot-text-disabled">
                        {sub.message_count} msgs
                      </span>
                      {rate > 0 && (
                        <span className="text-2xs text-iot-cyan font-mono">
                          {rate.toFixed(1)}/s
                        </span>
                      )}
                    </div>
                  </div>
                  <Tooltip content="Unsubscribe">
                    <button
                      onClick={() => setUnsubTarget({ id: sub.id, topic: sub.topic_filter })}
                      className="text-iot-text-disabled hover:text-iot-red transition-colors opacity-0 group-hover:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-iot-border-focus focus-visible:ring-offset-1 focus-visible:ring-offset-iot-bg-base rounded"
                    >
                      <Trash2 size={12} />
                    </button>
                  </Tooltip>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Footer with stats and clear button */}
      <div className="px-3 py-1.5 border-t border-iot-border flex-shrink-0 flex items-center gap-2">
        <span className="text-2xs text-iot-text-disabled flex-1">
          {messages.length} msgs
          {totalRate > 0 && (
            <span className="text-iot-cyan ml-1">{totalRate.toFixed(1)}/s</span>
          )}
        </span>
        {messages.length > 0 && (
          <Tooltip content="Clear all messages">
            <button
              onClick={() => setConfirmClear(true)}
              className="flex items-center gap-1 text-2xs text-iot-text-disabled hover:text-iot-red transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-iot-border-focus focus-visible:ring-offset-1 focus-visible:ring-offset-iot-bg-base rounded"
            >
              <Eraser size={10} />
              Clear
            </button>
          </Tooltip>
        )}
      </div>

      {/* Confirm dialogs */}
      <ConfirmDialog
        open={unsubTarget !== null}
        onClose={() => setUnsubTarget(null)}
        onConfirm={() => {
          if (unsubTarget) {
            handleUnsubscribe(unsubTarget.id);
            setUnsubTarget(null);
          }
        }}
        title="Unsubscribe"
        message={`Unsubscribe from "${unsubTarget?.topic ?? ""}"?`}
        confirmLabel="Unsubscribe"
        danger
      />
      <ConfirmDialog
        open={confirmClear}
        onClose={() => setConfirmClear(false)}
        onConfirm={() => {
          clearMessages();
          setConfirmClear(false);
        }}
        title="Clear Messages"
        message={`Clear all ${messages.length} messages? This cannot be undone.`}
        confirmLabel="Clear"
        danger
      />
    </div>
  );
};
