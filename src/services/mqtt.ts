import { invoke } from "@tauri-apps/api/core";
import { withLogging } from "@/services/logger";
import type {
  MqttConnectionConfig,
  MqttConnectionInfo,
  MqttConnectionStatus,
  MqttSubscribeRequest,
  MqttSubscriptionInfo,
  MqttPublishRequest,
  MqttPollResponse,
  MqttTopicInfo,
  BrokerStats,
  BrokerClientInfo,
} from "@/types/mqtt";

// ─── Connection ──────────────────────────────────────────────────

export const mqttConnect = withLogging(
  "mqtt_connect",
  async (config: MqttConnectionConfig): Promise<string> => {
    return invoke("mqtt_connect", { config });
  }
);

export const mqttDisconnect = withLogging(
  "mqtt_disconnect",
  async (connectionId: string): Promise<void> => {
    return invoke("mqtt_disconnect", { connectionId });
  }
);

export const mqttGetConnections = withLogging(
  "mqtt_get_connections",
  async (): Promise<MqttConnectionInfo[]> => {
    return invoke("mqtt_get_connections");
  }
);

export const mqttGetConnectionStatus = withLogging(
  "mqtt_get_connection_status",
  async (connectionId: string): Promise<MqttConnectionStatus> => {
    return invoke("mqtt_get_connection_status", { connectionId });
  }
);

// ─── Subscriptions ───────────────────────────────────────────────

export const mqttSubscribe = withLogging(
  "mqtt_subscribe",
  async (connectionId: string, request: MqttSubscribeRequest): Promise<MqttSubscriptionInfo> => {
    return invoke("mqtt_subscribe", { connectionId, request });
  }
);

export const mqttUnsubscribe = withLogging(
  "mqtt_unsubscribe",
  async (connectionId: string, subscriptionId: number): Promise<void> => {
    return invoke("mqtt_unsubscribe", { connectionId, subscriptionId });
  }
);

export const mqttGetSubscriptions = withLogging(
  "mqtt_get_subscriptions",
  async (connectionId: string): Promise<MqttSubscriptionInfo[]> => {
    return invoke("mqtt_get_subscriptions", { connectionId });
  }
);

// ─── Publish ─────────────────────────────────────────────────────

export const mqttPublish = withLogging(
  "mqtt_publish",
  async (connectionId: string, request: MqttPublishRequest): Promise<void> => {
    return invoke("mqtt_publish", { connectionId, request });
  }
);

// ─── Messages & Topics ──────────────────────────────────────────

export const mqttPollMessages = withLogging(
  "mqtt_poll_messages",
  async (connectionId: string): Promise<MqttPollResponse> => {
    return invoke("mqtt_poll_messages", { connectionId });
  }
);

export const mqttGetTopics = withLogging(
  "mqtt_get_topics",
  async (connectionId: string): Promise<MqttTopicInfo[]> => {
    return invoke("mqtt_get_topics", { connectionId });
  }
);

// ─── Broker Admin ────────────────────────────────────────────────

export const mqttGetBrokerStats = withLogging(
  "mqtt_get_broker_stats",
  async (connectionId: string): Promise<BrokerStats> => {
    return invoke("mqtt_get_broker_stats", { connectionId });
  }
);

export const mqttGetBrokerClients = withLogging(
  "mqtt_get_broker_clients",
  async (connectionId: string): Promise<BrokerClientInfo[]> => {
    return invoke("mqtt_get_broker_clients", { connectionId });
  }
);
