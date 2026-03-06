// ─── Connection Types ────────────────────────────────────────────

export interface ConnectionConfig {
  name: string;
  endpoint_url: string;
  security_policy: string;
  security_mode: string;
  auth_type: "anonymous" | "username_password" | "certificate";
  username?: string;
  password?: string;
  session_timeout?: number;
  use_simulator?: boolean;
}

export type ConnectionStatus =
  | "disconnected"
  | "connecting"
  | "connected"
  | "reconnecting"
  | "error";

export interface ConnectionInfo {
  id: string;
  name: string;
  endpoint_url: string;
  status: ConnectionStatus;
  security_policy: string;
  security_mode: string;
  is_simulator: boolean;
}

export interface EndpointInfo {
  url: string;
  security_policy: string;
  security_mode: string;
  user_identity_tokens: UserTokenInfo[];
}

export interface UserTokenInfo {
  policy_id: string;
  token_type: string;
}

// ─── Browse Types ────────────────────────────────────────────────

export interface BrowseNode {
  node_id: string;
  browse_name: string;
  display_name: string;
  node_class: string;
  has_children: boolean;
  type_definition?: string;
}

export interface NodeAttribute {
  name: string;
  value: string;
  data_type?: string;
  status: string;
}

export interface NodeDetails {
  node_id: string;
  browse_name: string;
  display_name: string;
  description: string;
  node_class: string;
  data_type?: string;
  value?: string;
  status_code: string;
  server_timestamp?: string;
  source_timestamp?: string;
  access_level?: number;
  user_access_level?: number;
  minimum_sampling_interval?: number;
  historizing?: boolean;
  value_rank?: number;
  attributes: NodeAttribute[];
  references: ReferenceInfo[];
}

export interface ReferenceInfo {
  reference_type: string;
  is_forward: boolean;
  target_node_id: string;
  target_browse_name: string;
  target_display_name: string;
  target_node_class: string;
}

// ─── Read/Write Types ────────────────────────────────────────────

export interface ReadResult {
  node_id: string;
  value?: string;
  data_type?: string;
  status_code: string;
  server_timestamp?: string;
  source_timestamp?: string;
}

export interface WriteRequest {
  node_id: string;
  value: string;
  data_type: string;
}

export interface WriteResult {
  node_id: string;
  status_code: string;
  success: boolean;
}

// ─── Subscription Types ──────────────────────────────────────────

export interface CreateSubscriptionRequest {
  publishing_interval: number;
  lifetime_count: number;
  max_keep_alive_count: number;
  max_notifications_per_publish: number;
  priority: number;
  publishing_enabled: boolean;
}

export interface CreateSubscriptionResult {
  subscription_id: number;
  revised_publishing_interval: number;
  revised_lifetime_count: number;
  revised_max_keep_alive_count: number;
}

export interface MonitoredItemRequest {
  node_id: string;
  display_name?: string;
  sampling_interval: number;
  queue_size: number;
  discard_oldest: boolean;
}

export interface DataChangeEvent {
  subscription_id: number;
  monitored_item_id: number;
  node_id: string;
  display_name: string;
  value: string;
  data_type: string;
  status_code: string;
  source_timestamp?: string;
  server_timestamp?: string;
}

export interface SubscriptionInfo {
  id: number;
  publishing_interval: number;
  monitored_items: MonitoredItemInfo[];
}

export interface MonitoredItemInfo {
  id: number;
  node_id: string;
  display_name: string;
  sampling_interval: number;
}

// ─── Method Types ────────────────────────────────────────────────

export interface CallMethodRequest {
  object_node_id: string;
  method_node_id: string;
  input_arguments: string[];
}

export interface CallMethodResult {
  status_code: string;
  output_arguments: string[];
}

// ─── App Types ───────────────────────────────────────────────────

export type ProtocolType = "opcua" | "mqtt" | "modbus";

export type ViewMode =
  | "connection"
  | "browse"
  | "attributes"
  | "subscriptions"
  | "methods"
  | "events"
  | "dashboard"
  | "export";

export interface TreeNodeState {
  node: BrowseNode;
  children?: TreeNodeState[];
  expanded: boolean;
  loading: boolean;
}

export interface MonitoredValue extends DataChangeEvent {
  history: { timestamp: number; value: number }[];
  numericValue?: number;
  previousValue?: string;
  unit?: string;
}

// ─── Event Types ─────────────────────────────────────────────────

export interface EventData {
  event_id: string;
  source_name: string;
  event_type: string;
  severity: number;
  message: string;
  timestamp: string;
  receive_time: string;
  source_node_id?: string;
}
