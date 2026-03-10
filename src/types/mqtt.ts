// ─── Mode & QoS ──────────────────────────────────────────────────

export type MqttMode = "client" | "broker";

export type MqttProtocolVersion = "v311" | "v5";

export type MqttQoS = "0" | "1" | "2";

export type MqttAuthType = "anonymous" | "username_password" | "certificate";

export type MqttConnectionStatus =
  | "disconnected"
  | "connecting"
  | "connected"
  | "reconnecting"
  | "error";

export type PayloadFormat = "text" | "json" | "hex" | "base64";

// ─── Connection Types ────────────────────────────────────────────

export interface MqttTlsConfig {
  ca_cert_path?: string | null;
  client_cert_path?: string | null;
  client_key_path?: string | null;
  accept_invalid_certs: boolean;
}

export interface MqttLastWill {
  topic: string;
  payload: string;
  qos: MqttQoS;
  retain: boolean;
}

export interface MqttConnectionConfig {
  name: string;
  mode: MqttMode;
  host: string;
  port: number;
  client_id?: string | null;
  protocol_version: MqttProtocolVersion;
  auth_type: MqttAuthType;
  username?: string | null;
  password?: string | null;
  keep_alive_secs?: number | null;
  clean_session: boolean;
  tls?: MqttTlsConfig | null;
  last_will?: MqttLastWill | null;
  broker_bind_address?: string | null;
  broker_max_connections?: number | null;
}

export interface MqttConnectionInfo {
  id: string;
  name: string;
  mode: MqttMode;
  status: MqttConnectionStatus;
  host: string;
  port: number;
  client_id: string;
  protocol_version: MqttProtocolVersion;
  last_error?: string | null;
  connected_clients?: number | null;
}

// ─── Subscription Types ──────────────────────────────────────────

export interface MqttSubscribeRequest {
  topic_filter: string;
  qos: MqttQoS;
}

export interface MqttSubscriptionInfo {
  id: number;
  topic_filter: string;
  qos: MqttQoS;
  message_count: number;
  active: boolean;
}

// ─── Message Types ───────────────────────────────────────────────

export interface MqttMessage {
  id: string;
  topic: string;
  payload: string;
  payload_format: PayloadFormat;
  qos: MqttQoS;
  retain: boolean;
  timestamp: string;
  payload_size_bytes: number;
}

export interface MqttPublishRequest {
  topic: string;
  payload: string;
  qos: MqttQoS;
  retain: boolean;
}

export interface MqttPollResponse {
  messages: MqttMessage[];
  topics_updated: boolean;
}

// ─── Topic Types ─────────────────────────────────────────────────

export interface MqttTopicInfo {
  topic: string;
  message_count: number;
  last_payload_preview?: string | null;
  last_timestamp?: string | null;
  subscriber_count: number;
  retained_payload?: string | null;
}

/** Hierarchical topic tree node for the Topic Explorer. */
export interface TopicTreeNode {
  segment: string;
  fullTopic: string;
  children: Map<string, TopicTreeNode>;
  info?: MqttTopicInfo;
  /** Last message seen for this exact topic */
  lastMessage?: MqttMessage;
}

// ─── Broker Types ────────────────────────────────────────────────

export interface BrokerClientInfo {
  client_id: string;
  connected_at: string;
  subscriptions: string[];
  messages_in: number;
  messages_out: number;
}

export interface BrokerStats {
  total_connections: number;
  active_connections: number;
  messages_received: number;
  messages_sent: number;
  subscriptions_active: number;
  bytes_received: number;
  bytes_sent: number;
  uptime_secs: number;
  retained_messages: number;
}

// ─── Publish History ─────────────────────────────────────────────

export interface MqttPublishTemplate {
  name: string;
  topic: string;
  payload: string;
  qos: MqttQoS;
  retain: boolean;
}
