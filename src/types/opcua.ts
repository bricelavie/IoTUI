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
  last_error?: string | null;
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

export interface HistoryReadRequest {
  node_id: string;
  start_time?: string;
  end_time?: string;
  max_values?: number;
}

export interface HistoryValue {
  value?: string;
  data_type?: string;
  status_code: string;
  source_timestamp?: string;
  server_timestamp?: string;
}

export interface HistoryReadResult {
  node_id: string;
  values: HistoryValue[];
  continuation_point?: string;
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

export interface MethodArgument {
  name: string;
  data_type: string;
  description: string;
}

export interface MethodInfo {
  node_id: string;
  browse_name: string;
  display_name: string;
  description: string;
  input_arguments: MethodArgument[];
  output_arguments: MethodArgument[];
}

export interface TypedArgValue {
  value: string;
  data_type: string;
}

export interface CallMethodRequest {
  object_node_id: string;
  method_node_id: string;
  input_arguments: TypedArgValue[];
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
  | "export"
  | "logs"
  | "settings";

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
  subscriptionKey?: string;
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

// ─── Log Types ───────────────────────────────────────────────────

export type LogLevel = "trace" | "debug" | "info" | "warn" | "error";

export type LogCategory =
  | "ipc"
  | "backend"
  | "subscription"
  | "connection"
  | "action";

export interface LogEntry {
  id: number;
  timestamp: string;
  level: LogLevel;
  category: LogCategory;
  source: string;
  message: string;
  duration?: number;
  details?: string;
}

export interface BackendLogEntry {
  timestamp: string;
  level: string;
  target: string;
  message: string;
}

// ─── Error Types ─────────────────────────────────────────────────

export type AppErrorKind =
  | "OpcUa"
  | "Connection"
  | "NotFound"
  | "InvalidArgument"
  | "Security";

export interface AppError {
  kind: AppErrorKind;
  message: string;
}

/**
 * Parse a Tauri invoke rejection into a structured `AppError`.
 *
 * With Tauri 2 native error serialization the backend returns `{ kind, message }`
 * objects directly.  Legacy string payloads (JSON-encoded or plain) are still
 * handled for backwards compatibility.
 */
export function parseAppError(raw: unknown): AppError {
  // Already a structured error object from Tauri 2 native serialization
  if (raw != null && typeof raw === "object") {
    const obj = raw as Record<string, unknown>;
    if (typeof obj.kind === "string" && typeof obj.message === "string") {
      return obj as unknown as AppError;
    }
  }
  // Legacy: JSON-encoded string from old `Result<T, String>` commands
  if (typeof raw === "string") {
    try {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed.kind === "string" && typeof parsed.message === "string") {
        return parsed as AppError;
      }
    } catch {
      // not JSON — use raw string as message
    }
    return { kind: "OpcUa", message: raw };
  }
  return { kind: "OpcUa", message: String(raw ?? "Unknown error") };
}

/**
 * Extract a human-readable error message from any caught value.
 *
 * Use this everywhere instead of `String(e)` so that structured
 * `AppError` objects are displayed properly.
 */
export function errorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (err != null && typeof err === "object") {
    const obj = err as Record<string, unknown>;
    if (typeof obj.message === "string") return obj.message;
  }
  if (typeof err === "string") return err;
  return String(err ?? "Unknown error");
}
