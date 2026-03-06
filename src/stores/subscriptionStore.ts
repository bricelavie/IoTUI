import { create } from "zustand";
import type {
  CreateSubscriptionRequest,
  DataChangeEvent,
  MonitoredItemRequest,
  MonitoredValue,
  SubscriptionInfo,
} from "@/types/opcua";
import * as opcua from "@/services/opcua";
import { toast } from "@/stores/notificationStore";

interface SubscriptionStore {
  // State
  subscriptions: SubscriptionInfo[];
  activeSubscriptionId: number | null;
  monitoredValues: Map<string, MonitoredValue>;
  isPolling: boolean;
  pollIntervalId: ReturnType<typeof setInterval> | null;

  // Actions
  createSubscription: (
    connectionId: string,
    request?: Partial<CreateSubscriptionRequest>
  ) => Promise<number>;
  deleteSubscription: (connectionId: string, subId: number) => Promise<void>;
  addMonitoredItem: (
    connectionId: string,
    subscriptionId: number,
    item: MonitoredItemRequest
  ) => Promise<void>;
  removeMonitoredItem: (
    connectionId: string,
    subscriptionId: number,
    itemId: number,
    nodeId: string
  ) => Promise<void>;
  startPolling: (connectionId: string, subscriptionId: number) => void;
  stopPolling: () => void;
  refreshSubscriptions: (connectionId: string) => Promise<void>;
  clearAll: () => void;
}

const MAX_HISTORY = 100;

export const useSubscriptionStore = create<SubscriptionStore>((set, get) => ({
  subscriptions: [],
  activeSubscriptionId: null,
  monitoredValues: new Map(),
  isPolling: false,
  pollIntervalId: null,

  createSubscription: async (connectionId, request) => {
    const defaults: CreateSubscriptionRequest = {
      publishing_interval: 500,
      lifetime_count: 60,
      max_keep_alive_count: 10,
      max_notifications_per_publish: 0,
      priority: 0,
      publishing_enabled: true,
      ...request,
    };

    const result = await opcua.createSubscription(connectionId, defaults);
    const subs = await opcua.getSubscriptions(connectionId);
    set({
      subscriptions: subs,
      activeSubscriptionId: result.subscription_id,
    });
    toast.success("Subscription created", `#${result.subscription_id} (${result.revised_publishing_interval}ms)`);
    return result.subscription_id;
  },

  deleteSubscription: async (connectionId, subId) => {
    const { stopPolling, activeSubscriptionId } = get();
    if (activeSubscriptionId === subId) {
      stopPolling();
    }
    await opcua.deleteSubscription(connectionId, subId);
    const subs = await opcua.getSubscriptions(connectionId);
    set({
      subscriptions: subs,
      activeSubscriptionId:
        activeSubscriptionId === subId ? null : activeSubscriptionId,
    });
    toast.info("Subscription deleted", `#${subId}`);
  },

  addMonitoredItem: async (connectionId, subscriptionId, item) => {
    await opcua.addMonitoredItems(connectionId, subscriptionId, [item]);
    const subs = await opcua.getSubscriptions(connectionId);
    set({ subscriptions: subs });
  },

  removeMonitoredItem: async (connectionId, subscriptionId, itemId, nodeId) => {
    await opcua.removeMonitoredItems(connectionId, subscriptionId, [itemId]);
    const subs = await opcua.getSubscriptions(connectionId);
    const newValues = new Map(get().monitoredValues);
    newValues.delete(nodeId);
    set({ subscriptions: subs, monitoredValues: newValues });
    toast.info("Removed monitored item");
  },

  startPolling: (connectionId, subscriptionId) => {
    const { pollIntervalId, subscriptions } = get();
    if (pollIntervalId) {
      clearInterval(pollIntervalId);
    }

    // Use the subscription's publishing interval instead of hardcoded 500ms
    const sub = subscriptions.find((s) => s.id === subscriptionId);
    const interval = sub?.publishing_interval ?? 500;

    set({ isPolling: true, activeSubscriptionId: subscriptionId });

    const poll = async () => {
      try {
        const events = await opcua.pollSubscription(
          connectionId,
          subscriptionId
        );
        const { monitoredValues } = get();
        const newValues = new Map(monitoredValues);

        for (const event of events) {
          const existing = newValues.get(event.node_id);
          const numericValue = parseFloat(event.value);
          const isNumeric = !isNaN(numericValue);

          // Create a NEW array (not mutate in-place) so React detects the change
          let history = existing?.history ? [...existing.history] : [];
          if (isNumeric) {
            history.push({ timestamp: Date.now(), value: numericValue });
            if (history.length > MAX_HISTORY) {
              history = history.slice(history.length - MAX_HISTORY);
            }
          }

          newValues.set(event.node_id, {
            ...event,
            history,
            numericValue: isNumeric ? numericValue : undefined,
            previousValue: existing?.value,
          });
        }

        set({ monitoredValues: newValues });
      } catch (e) {
        // Silently fail on poll errors to avoid toast spam
        console.error("Poll failed:", e);
      }
    };

    // First poll immediately
    poll();

    const id = setInterval(poll, interval);
    set({ pollIntervalId: id });
  },

  stopPolling: () => {
    const { pollIntervalId } = get();
    if (pollIntervalId) {
      clearInterval(pollIntervalId);
    }
    set({ isPolling: false, pollIntervalId: null });
  },

  refreshSubscriptions: async (connectionId) => {
    const subs = await opcua.getSubscriptions(connectionId);
    set({ subscriptions: subs });
  },

  clearAll: () => {
    const { stopPolling } = get();
    stopPolling();
    set({
      subscriptions: [],
      activeSubscriptionId: null,
      monitoredValues: new Map(),
    });
  },
}));
