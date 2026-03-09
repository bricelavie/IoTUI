import { create } from "zustand";
import type {
  MqttSubscribeRequest,
  MqttSubscriptionInfo,
  MqttMessage,
  MqttPollResponse,
  MqttQoS,
} from "@/types/mqtt";
import { errorMessage } from "@/types/opcua";
import * as mqtt from "@/services/mqtt";
import { toast } from "@/stores/notificationStore";
import { getSetting } from "@/stores/settingsStore";
import { log } from "@/services/logger";

interface PollController {
  timerId: ReturnType<typeof setTimeout> | null;
  inFlight: boolean;
  lastError: string | null;
  lastSuccessAt: number | null;
  connectionId: string;
}

interface MqttSubscriptionStore {
  subscriptions: MqttSubscriptionInfo[];
  messages: MqttMessage[];
  isPolling: boolean;
  pollError: string | null;
  lastPollAt: number | null;

  subscribe: (connectionId: string, topicFilter: string, qos?: MqttQoS) => Promise<number>;
  unsubscribe: (connectionId: string, subscriptionId: number) => Promise<void>;
  refreshSubscriptions: (connectionId: string) => Promise<void>;
  startPolling: (connectionId: string) => void;
  stopPolling: () => void;
  clearMessages: () => void;
  clearAll: () => void;
}

let pollController: PollController | null = null;

function clearPollController() {
  if (pollController?.timerId) {
    clearTimeout(pollController.timerId);
  }
  pollController = null;
}

export const useMqttSubscriptionStore = create<MqttSubscriptionStore>((set, get) => ({
  subscriptions: [],
  messages: [],
  isPolling: false,
  pollError: null,
  lastPollAt: null,

  subscribe: async (connectionId, topicFilter, qos) => {
    const request: MqttSubscribeRequest = {
      topic_filter: topicFilter,
      qos: qos ?? (String(getSetting("mqttDefaultQoS")) as MqttQoS),
    };
    const subId = await mqtt.mqttSubscribe(connectionId, request);
    const subs = await mqtt.mqttGetSubscriptions(connectionId);
    set({ subscriptions: subs });
    log("info", "subscription", "mqtt_subscribe", `Subscribed to "${topicFilter}" (id=${subId})`);
    toast.success("Subscribed", topicFilter);
    return subId;
  },

  unsubscribe: async (connectionId, subscriptionId) => {
    const sub = get().subscriptions.find((s) => s.id === subscriptionId);
    await mqtt.mqttUnsubscribe(connectionId, subscriptionId);
    const subs = await mqtt.mqttGetSubscriptions(connectionId);
    set({ subscriptions: subs });
    log("info", "subscription", "mqtt_unsubscribe", `Unsubscribed (id=${subscriptionId})`);
    toast.info("Unsubscribed", sub?.topic_filter || `#${subscriptionId}`);
  },

  refreshSubscriptions: async (connectionId) => {
    const subs = await mqtt.mqttGetSubscriptions(connectionId);
    set({ subscriptions: subs });
  },

  startPolling: (connectionId) => {
    // Stop any existing poll
    clearPollController();

    const controller: PollController = {
      timerId: null,
      inFlight: false,
      lastError: null,
      lastSuccessAt: null,
      connectionId,
    };
    pollController = controller;

    const interval = getSetting("mqttPollInterval");
    const maxMessages = getSetting("mqttMaxStreamMessages");

    const schedule = (delay: number) => {
      controller.timerId = setTimeout(runPoll, delay);
    };

    const runPoll = async () => {
      if (controller.inFlight) {
        schedule(interval);
        return;
      }

      controller.inFlight = true;
      try {
        const response: MqttPollResponse = await mqtt.mqttPollMessages(controller.connectionId);
        controller.lastError = null;
        controller.lastSuccessAt = Date.now();

        if (response.messages.length > 0) {
          const { messages: existing } = get();
          let updated = [...existing, ...response.messages];
          if (updated.length > maxMessages) {
            updated = updated.slice(updated.length - maxMessages);
          }
          set({ messages: updated, pollError: null, lastPollAt: Date.now() });
        } else {
          set({ pollError: null, lastPollAt: Date.now() });
        }
      } catch (e) {
        const message = errorMessage(e);
        controller.lastError = message;
        set({ pollError: message });
        log("warn", "subscription", "mqtt_poll", `Poll failed: ${message}`);
      } finally {
        controller.inFlight = false;
        if (get().isPolling) {
          schedule(interval);
        }
      }
    };

    set({ isPolling: true });
    log("info", "subscription", "mqtt_startPolling", `Polling MQTT every ${interval}ms`);
    void runPoll();
  },

  stopPolling: () => {
    clearPollController();
    set({ isPolling: false });
    log("info", "subscription", "mqtt_stopPolling", "MQTT polling stopped");
  },

  clearMessages: () => set({ messages: [] }),

  clearAll: () => {
    get().stopPolling();
    set({
      subscriptions: [],
      messages: [],
      isPolling: false,
      pollError: null,
      lastPollAt: null,
    });
  },
}));
