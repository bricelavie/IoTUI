import { create } from "zustand";
import type {
  CreateSubscriptionRequest,
  MonitoredItemRequest,
  MonitoredValue,
  SubscriptionInfo,
} from "@/types/opcua";
import * as opcua from "@/services/opcua";
import { toast } from "@/stores/notificationStore";
import { getSetting } from "@/stores/settingsStore";
import { log } from "@/services/logger";

const SUBSCRIPTION_STATE_KEY = "iotui_subscription_state_v1";

interface SubscriptionMeta {
  name: string;
}

interface PollController {
  timerId: ReturnType<typeof setTimeout> | null;
  inFlight: boolean;
  lastError: string | null;
  lastSuccessAt: number | null;
  lastPollAt: number | null;
}

interface SubscriptionStore {
  subscriptions: SubscriptionInfo[];
  activeSubscriptionId: number | null;
  monitoredValues: Map<string, MonitoredValue>;
  activePollers: Set<number>;
  subscriptionMeta: Map<number, SubscriptionMeta>;
  nextSubNumber: number;
  pollErrors: Map<number, string>;
  lastUpdateAt: Map<number, number>;
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
  stopPolling: (subscriptionId?: number) => void;
  refreshSubscriptions: (connectionId: string) => Promise<void>;
  renameSubscription: (subId: number, name: string) => void;
  getSubscriptionName: (subId: number) => string;
  getAllMonitoredNodeIds: () => Set<string>;
  getSubscriptionsForNode: (nodeId: string) => { subId: number; name: string; itemId: number }[];
  getSubStatus: (subId: number) => { isPolling: boolean; lastError: string | null; lastUpdateAt: number | null };
  setActiveSubscriptionId: (subId: number | null) => void;
  clearAll: () => void;
}

const pollControllers = new Map<number, PollController>();

function monitoredValueKey(subscriptionId: number, nodeId: string) {
  return `${subscriptionId}::${nodeId}`;
}

function ensureController(subscriptionId: number): PollController {
  let controller = pollControllers.get(subscriptionId);
  if (!controller) {
    controller = {
      timerId: null,
      inFlight: false,
      lastError: null,
      lastSuccessAt: null,
      lastPollAt: null,
    };
    pollControllers.set(subscriptionId, controller);
  }
  return controller;
}

function clearController(subscriptionId: number) {
  const controller = pollControllers.get(subscriptionId);
  if (!controller) return;
  if (controller.timerId) {
    clearTimeout(controller.timerId);
  }
  pollControllers.delete(subscriptionId);
}

function loadPersistedState() {
  try {
    const raw = localStorage.getItem(SUBSCRIPTION_STATE_KEY);
    if (!raw) {
      return {
        activeSubscriptionId: null as number | null,
        nextSubNumber: 1,
        subscriptionMeta: new Map<number, SubscriptionMeta>(),
      };
    }
    const parsed = JSON.parse(raw) as {
      activeSubscriptionId?: number | null;
      nextSubNumber?: number;
      subscriptionMeta?: Record<string, SubscriptionMeta>;
    };
    return {
      activeSubscriptionId:
        typeof parsed.activeSubscriptionId === "number" ? parsed.activeSubscriptionId : null,
      nextSubNumber:
        typeof parsed.nextSubNumber === "number" ? parsed.nextSubNumber : 1,
      subscriptionMeta: new Map(
        Object.entries(parsed.subscriptionMeta ?? {}).map(([key, value]) => [Number(key), value])
      ),
    };
  } catch {
    return {
      activeSubscriptionId: null as number | null,
      nextSubNumber: 1,
      subscriptionMeta: new Map<number, SubscriptionMeta>(),
    };
  }
}

function persistState(state: {
  activeSubscriptionId: number | null;
  nextSubNumber: number;
  subscriptionMeta: Map<number, SubscriptionMeta>;
}) {
  localStorage.setItem(
    SUBSCRIPTION_STATE_KEY,
    JSON.stringify({
      activeSubscriptionId: state.activeSubscriptionId,
      nextSubNumber: state.nextSubNumber,
      subscriptionMeta: Object.fromEntries(state.subscriptionMeta.entries()),
    })
  );
}

const persistedState = loadPersistedState();

export const useSubscriptionStore = create<SubscriptionStore>((set, get) => ({
  subscriptions: [],
  activeSubscriptionId: persistedState.activeSubscriptionId,
  monitoredValues: new Map(),
  activePollers: new Set(),
  subscriptionMeta: persistedState.subscriptionMeta,
  nextSubNumber: persistedState.nextSubNumber,
  pollErrors: new Map(),
  lastUpdateAt: new Map(),

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
    persistState({
      activeSubscriptionId: result.subscription_id,
      nextSubNumber: nextSubNumber + 1,
      subscriptionMeta: newMeta,
    });
    log("info", "subscription", "createSubscription", `Created "${subName}" (id=${result.subscription_id}, interval=${result.revised_publishing_interval}ms)`);
    toast.success("Subscription created", `${subName} (${result.revised_publishing_interval}ms)`);
    return result.subscription_id;
  },

  deleteSubscription: async (connectionId, subId) => {
    const { activeSubscriptionId, subscriptionMeta, subscriptions, nextSubNumber } = get();
    const name = subscriptionMeta.get(subId)?.name || `#${subId}`;
    const deletedSub = subscriptions.find((s) => s.id === subId);
    get().stopPolling(subId);
    await opcua.deleteSubscription(connectionId, subId);
    const subs = await opcua.getSubscriptions(connectionId);

    const newValues = new Map(get().monitoredValues);
    if (deletedSub) {
      for (const item of deletedSub.monitored_items) {
        newValues.delete(monitoredValueKey(subId, item.node_id));
      }
    }

    const newMeta = new Map(subscriptionMeta);
    newMeta.delete(subId);
    const newErrors = new Map(get().pollErrors);
    newErrors.delete(subId);
    const newUpdates = new Map(get().lastUpdateAt);
    newUpdates.delete(subId);
    const nextActive = activeSubscriptionId === subId ? null : activeSubscriptionId;

    set({
      subscriptions: subs,
      activeSubscriptionId: nextActive,
      subscriptionMeta: newMeta,
      monitoredValues: newValues,
      pollErrors: newErrors,
      lastUpdateAt: newUpdates,
    });
    persistState({
      activeSubscriptionId: nextActive,
      nextSubNumber,
      subscriptionMeta: newMeta,
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
    const newValues = new Map(get().monitoredValues);
    newValues.delete(monitoredValueKey(subscriptionId, nodeId));
    set({ subscriptions: subs, monitoredValues: newValues });
    toast.info("Removed monitored item");
  },

  startPolling: (connectionId, subscriptionId) => {
    const sub = get().subscriptions.find((entry) => entry.id === subscriptionId);
    const interval = sub?.publishing_interval ?? getSetting("defaultPublishingInterval");
    const controller = ensureController(subscriptionId);

    if (controller.timerId) {
      clearTimeout(controller.timerId);
      controller.timerId = null;
    }

    const schedule = (delay: number) => {
      controller.timerId = setTimeout(runPoll, delay);
    };

    const runPoll = async () => {
      if (controller.inFlight) {
        schedule(interval);
        return;
      }

      controller.inFlight = true;
      controller.lastPollAt = Date.now();
      try {
        const events = await opcua.pollSubscription(connectionId, subscriptionId);
        const { monitoredValues, pollErrors, lastUpdateAt } = get();
        const newValues = new Map(monitoredValues);
        const newErrors = new Map(pollErrors);
        const newUpdates = new Map(lastUpdateAt);

        for (const event of events) {
          const key = monitoredValueKey(subscriptionId, event.node_id);
          const existing = newValues.get(key);
          const numericValue = parseFloat(event.value);
          const isNumeric = !Number.isNaN(numericValue);
          let history = existing?.history ? [...existing.history] : [];
          if (isNumeric) {
            const maxHistory = getSetting("maxHistoryPoints");
            history.push({ timestamp: Date.now(), value: numericValue });
            if (history.length > maxHistory) {
              history = history.slice(history.length - maxHistory);
            }
          }

          newValues.set(key, {
            ...event,
            history,
            numericValue: isNumeric ? numericValue : undefined,
            previousValue: existing?.value,
            subscriptionKey: key,
          });
        }

        controller.lastError = null;
        controller.lastSuccessAt = Date.now();
        newErrors.delete(subscriptionId);
        newUpdates.set(subscriptionId, controller.lastSuccessAt);

        set({ monitoredValues: newValues, pollErrors: newErrors, lastUpdateAt: newUpdates });
      } catch (e) {
        const message = String(e);
        controller.lastError = message;
        const nextErrors = new Map(get().pollErrors);
        nextErrors.set(subscriptionId, message);
        set({ pollErrors: nextErrors });
        log("warn", "subscription", "poll", `Polling failed for subscription ${subscriptionId}: ${message}`);
      } finally {
        controller.inFlight = false;
        const activePollers = new Set(get().activePollers);
        if (activePollers.has(subscriptionId)) {
          schedule(interval);
        }
      }
    };

    const activePollers = new Set(get().activePollers);
    activePollers.add(subscriptionId);
    set({ activePollers, activeSubscriptionId: subscriptionId });
    persistState({
      activeSubscriptionId: subscriptionId,
      nextSubNumber: get().nextSubNumber,
      subscriptionMeta: get().subscriptionMeta,
    });
    log("info", "subscription", "startPolling", `Polling sub ${subscriptionId} every ${interval}ms`);
    void runPoll();
  },

  stopPolling: (subscriptionId) => {
    const activePollers = new Set(get().activePollers);

    if (subscriptionId === undefined) {
      for (const subId of activePollers) {
        clearController(subId);
      }
      activePollers.clear();
      log("info", "subscription", "stopPolling", "All polling stopped");
      set({ activePollers });
      return;
    }

    if (activePollers.delete(subscriptionId)) {
      clearController(subscriptionId);
      log("info", "subscription", "stopPolling", `Polling stopped for sub ${subscriptionId}`);
      set({ activePollers });
    }
  },

  refreshSubscriptions: async (connectionId) => {
    const subs = await opcua.getSubscriptions(connectionId);
    const activeSubscriptionId = get().activeSubscriptionId;
    const nextActive = subs.some((sub) => sub.id === activeSubscriptionId)
      ? activeSubscriptionId
      : subs[0]?.id ?? null;
    set({ subscriptions: subs, activeSubscriptionId: nextActive });
    persistState({
      activeSubscriptionId: nextActive,
      nextSubNumber: get().nextSubNumber,
      subscriptionMeta: get().subscriptionMeta,
    });
  },

  renameSubscription: (subId, name) => {
    const newMeta = new Map(get().subscriptionMeta);
    const existing = newMeta.get(subId) || { name: `#${subId}` };
    newMeta.set(subId, { ...existing, name });
    set({ subscriptionMeta: newMeta });
    persistState({
      activeSubscriptionId: get().activeSubscriptionId,
      nextSubNumber: get().nextSubNumber,
      subscriptionMeta: newMeta,
    });
  },

  getSubscriptionName: (subId) => {
    return get().subscriptionMeta.get(subId)?.name || `Subscription #${subId}`;
  },

  getAllMonitoredNodeIds: () => {
    const nodeIds = new Set<string>();
    for (const sub of get().subscriptions) {
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

  getSubStatus: (subId) => ({
    isPolling: get().activePollers.has(subId),
    lastError: get().pollErrors.get(subId) ?? null,
    lastUpdateAt: get().lastUpdateAt.get(subId) ?? null,
  }),

  setActiveSubscriptionId: (subId) => {
    set({ activeSubscriptionId: subId });
    persistState({
      activeSubscriptionId: subId,
      nextSubNumber: get().nextSubNumber,
      subscriptionMeta: get().subscriptionMeta,
    });
  },

  clearAll: () => {
    get().stopPolling();
    set({
      subscriptions: [],
      activeSubscriptionId: null,
      monitoredValues: new Map(),
      activePollers: new Set(),
      subscriptionMeta: new Map(),
      nextSubNumber: 1,
      pollErrors: new Map(),
      lastUpdateAt: new Map(),
    });
    persistState({
      activeSubscriptionId: null,
      nextSubNumber: 1,
      subscriptionMeta: new Map(),
    });
  },
}));
