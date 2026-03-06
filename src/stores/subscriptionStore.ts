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
import { getSetting } from "@/stores/settingsStore";
import { log } from "@/services/logger";

interface SubscriptionMeta {
  name: string;
}

interface SubscriptionStore {
  // State
  subscriptions: SubscriptionInfo[];
  activeSubscriptionId: number | null;
  monitoredValues: Map<string, MonitoredValue>;
  isPolling: boolean;
  pollIntervalId: ReturnType<typeof setInterval> | null;
  subscriptionMeta: Map<number, SubscriptionMeta>;
  nextSubNumber: number;

  // Actions
  createSubscription: (
    connectionId: string,
    request?: Partial<CreateSubscriptionRequest>,
    name?: string
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
  renameSubscription: (subId: number, name: string) => void;
  getSubscriptionName: (subId: number) => string;
  getAllMonitoredNodeIds: () => Set<string>;
  getSubscriptionsForNode: (nodeId: string) => { subId: number; name: string; itemId: number }[];
  clearAll: () => void;
}

export const useSubscriptionStore = create<SubscriptionStore>((set, get) => ({
  subscriptions: [],
  activeSubscriptionId: null,
  monitoredValues: new Map(),
  isPolling: false,
  pollIntervalId: null,
  subscriptionMeta: new Map(),
  nextSubNumber: 1,

  createSubscription: async (connectionId, request, name) => {
    const { nextSubNumber, subscriptionMeta } = get();
    const defaults: CreateSubscriptionRequest = {
      publishing_interval: getSetting("defaultPublishingInterval"),
      lifetime_count: 60,
      max_keep_alive_count: 10,
      max_notifications_per_publish: 0,
      priority: 0,
      publishing_enabled: true,
      ...request,
    };

    const result = await opcua.createSubscription(connectionId, defaults);
    const subs = await opcua.getSubscriptions(connectionId);
    const newMeta = new Map(subscriptionMeta);
    const subName = name || `Subscription ${nextSubNumber}`;
    newMeta.set(result.subscription_id, { name: subName });
    set({
      subscriptions: subs,
      activeSubscriptionId: result.subscription_id,
      subscriptionMeta: newMeta,
      nextSubNumber: nextSubNumber + 1,
    });
    log("info", "subscription", "createSubscription", `Created "${subName}" (id=${result.subscription_id}, interval=${result.revised_publishing_interval}ms)`);
    toast.success("Subscription created", `${subName} (${result.revised_publishing_interval}ms)`);
    return result.subscription_id;
  },

  deleteSubscription: async (connectionId, subId) => {
    const { stopPolling, activeSubscriptionId, subscriptionMeta, subscriptions } = get();
    const name = subscriptionMeta.get(subId)?.name || `#${subId}`;
    // Capture the subscription's monitored items BEFORE deleting
    const deletedSub = subscriptions.find((s) => s.id === subId);
    if (activeSubscriptionId === subId) {
      stopPolling();
    }
    await opcua.deleteSubscription(connectionId, subId);
    const subs = await opcua.getSubscriptions(connectionId);

    // Clean monitoredValues: remove nodes that no surviving subscription monitors
    const newValues = new Map(get().monitoredValues);
    if (deletedSub) {
      const survivingNodeIds = new Set<string>();
      for (const s of subs) {
        for (const item of s.monitored_items) {
          survivingNodeIds.add(item.node_id);
        }
      }
      for (const item of deletedSub.monitored_items) {
        if (!survivingNodeIds.has(item.node_id)) {
          newValues.delete(item.node_id);
        }
      }
    }

    const newMeta = new Map(subscriptionMeta);
    newMeta.delete(subId);
    set({
      subscriptions: subs,
      activeSubscriptionId:
        activeSubscriptionId === subId ? null : activeSubscriptionId,
      subscriptionMeta: newMeta,
      monitoredValues: newValues,
    });
    log("info", "subscription", "deleteSubscription", `Deleted "${name}" (id=${subId})`);
    toast.info("Subscription deleted", name);
  },

  addMonitoredItem: async (connectionId, subscriptionId, item) => {
    await opcua.addMonitoredItems(connectionId, subscriptionId, [item]);
    const subs = await opcua.getSubscriptions(connectionId);
    set({ subscriptions: subs });
  },

  removeMonitoredItem: async (connectionId, subscriptionId, itemId, nodeId) => {
    await opcua.removeMonitoredItems(connectionId, subscriptionId, [itemId]);
    const subs = await opcua.getSubscriptions(connectionId);
    // Only remove from monitoredValues if no other subscription monitors this node
    const newValues = new Map(get().monitoredValues);
    const stillMonitored = subs.some((s) =>
      s.monitored_items.some((item) => item.node_id === nodeId)
    );
    if (!stillMonitored) {
      newValues.delete(nodeId);
    }
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
    const interval = sub?.publishing_interval ?? getSetting("defaultPublishingInterval");

    log("info", "subscription", "startPolling", `Polling sub ${subscriptionId} every ${interval}ms`);
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
            const maxHistory = getSetting("maxHistoryPoints");
            history.push({ timestamp: Date.now(), value: numericValue });
            if (history.length > maxHistory) {
              history = history.slice(history.length - maxHistory);
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
      log("info", "subscription", "stopPolling", "Polling stopped");
    }
    set({ isPolling: false, pollIntervalId: null });
  },

  refreshSubscriptions: async (connectionId) => {
    const subs = await opcua.getSubscriptions(connectionId);
    set({ subscriptions: subs });
  },

  renameSubscription: (subId, name) => {
    const newMeta = new Map(get().subscriptionMeta);
    const existing = newMeta.get(subId) || { name: `#${subId}` };
    newMeta.set(subId, { ...existing, name });
    set({ subscriptionMeta: newMeta });
  },

  getSubscriptionName: (subId) => {
    return get().subscriptionMeta.get(subId)?.name || `Subscription #${subId}`;
  },

  getAllMonitoredNodeIds: () => {
    const { subscriptions } = get();
    const nodeIds = new Set<string>();
    for (const sub of subscriptions) {
      for (const item of sub.monitored_items) {
        nodeIds.add(item.node_id);
      }
    }
    return nodeIds;
  },

  getSubscriptionsForNode: (nodeId) => {
    const { subscriptions, subscriptionMeta } = get();
    const results: { subId: number; name: string; itemId: number }[] = [];
    for (const sub of subscriptions) {
      for (const item of sub.monitored_items) {
        if (item.node_id === nodeId) {
          const name = subscriptionMeta.get(sub.id)?.name || `Subscription #${sub.id}`;
          results.push({ subId: sub.id, name, itemId: item.id });
        }
      }
    }
    return results;
  },

  clearAll: () => {
    const { stopPolling } = get();
    stopPolling();
    set({
      subscriptions: [],
      activeSubscriptionId: null,
      monitoredValues: new Map(),
      subscriptionMeta: new Map(),
      nextSubNumber: 1,
    });
  },
}));
