use serde::{Deserialize, Serialize};
use std::fmt;

// ─── Connection Types ────────────────────────────────────────────

#[derive(Clone, Serialize, Deserialize)]
pub struct ConnectionConfig {
    pub name: String,
    pub endpoint_url: String,
    pub security_policy: String,
    pub security_mode: String,
    pub auth_type: AuthType,
    pub username: Option<String>,
    #[serde(skip_serializing)]
    pub password: Option<String>,
    pub session_timeout: Option<u32>,
    /// When true, use the built-in simulator instead of connecting to an external OPC UA server.
    #[serde(default)]
    pub use_simulator: bool,
}

impl fmt::Debug for ConnectionConfig {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.debug_struct("ConnectionConfig")
            .field("name", &self.name)
            .field("endpoint_url", &self.endpoint_url)
            .field("security_policy", &self.security_policy)
            .field("security_mode", &self.security_mode)
            .field("auth_type", &self.auth_type)
            .field("username", &self.username)
            .field("password", &"<redacted>")
            .field("session_timeout", &self.session_timeout)
            .field("use_simulator", &self.use_simulator)
            .finish()
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum AuthType {
    Anonymous,
    UsernamePassword,
    Certificate,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "snake_case")]
pub enum ConnectionStatus {
    Disconnected,
    Connecting,
    Connected,
    Reconnecting,
    Error,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ConnectionInfo {
    pub id: String,
    pub name: String,
    pub endpoint_url: String,
    pub status: ConnectionStatus,
    pub security_policy: String,
    pub security_mode: String,
    pub is_simulator: bool,
    pub last_error: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EndpointInfo {
    pub url: String,
    pub security_policy: String,
    pub security_mode: String,
    pub user_identity_tokens: Vec<UserTokenInfo>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UserTokenInfo {
    pub policy_id: String,
    pub token_type: String,
}

// ─── Browse Types ────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BrowseNode {
    pub node_id: String,
    pub browse_name: String,
    pub display_name: String,
    pub node_class: String,
    pub has_children: bool,
    pub type_definition: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct NodeAttribute {
    pub name: String,
    pub value: String,
    pub data_type: Option<String>,
    pub status: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct NodeDetails {
    pub node_id: String,
    pub browse_name: String,
    pub display_name: String,
    pub description: String,
    pub node_class: String,
    pub data_type: Option<String>,
    pub value: Option<String>,
    pub status_code: String,
    pub server_timestamp: Option<String>,
    pub source_timestamp: Option<String>,
    pub access_level: Option<u8>,
    pub user_access_level: Option<u8>,
    pub minimum_sampling_interval: Option<f64>,
    pub historizing: Option<bool>,
    pub value_rank: Option<i32>,
    pub attributes: Vec<NodeAttribute>,
    pub references: Vec<ReferenceInfo>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ReferenceInfo {
    pub reference_type: String,
    pub is_forward: bool,
    pub target_node_id: String,
    pub target_browse_name: String,
    pub target_display_name: String,
    pub target_node_class: String,
}

// ─── Read/Write Types ────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ReadResult {
    pub node_id: String,
    pub value: Option<String>,
    pub data_type: Option<String>,
    pub status_code: String,
    pub server_timestamp: Option<String>,
    pub source_timestamp: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WriteRequest {
    pub node_id: String,
    pub value: String,
    pub data_type: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WriteResult {
    pub node_id: String,
    pub status_code: String,
    pub success: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct HistoryReadRequest {
    pub node_id: String,
    pub start_time: Option<String>,
    pub end_time: Option<String>,
    pub max_values: Option<u32>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct HistoryValue {
    pub value: Option<String>,
    pub data_type: Option<String>,
    pub status_code: String,
    pub source_timestamp: Option<String>,
    pub server_timestamp: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct HistoryReadResult {
    pub node_id: String,
    pub values: Vec<HistoryValue>,
    pub continuation_point: Option<String>,
}

// ─── Subscription Types ──────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CreateSubscriptionRequest {
    pub publishing_interval: f64,
    pub lifetime_count: u32,
    pub max_keep_alive_count: u32,
    pub max_notifications_per_publish: u32,
    pub priority: u8,
    pub publishing_enabled: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CreateSubscriptionResult {
    pub subscription_id: u32,
    pub revised_publishing_interval: f64,
    pub revised_lifetime_count: u32,
    pub revised_max_keep_alive_count: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MonitoredItemRequest {
    pub node_id: String,
    pub display_name: Option<String>,
    pub sampling_interval: f64,
    pub queue_size: u32,
    pub discard_oldest: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DataChangeEvent {
    pub subscription_id: u32,
    pub monitored_item_id: u32,
    pub node_id: String,
    pub display_name: String,
    pub value: String,
    pub data_type: String,
    pub status_code: String,
    pub source_timestamp: Option<String>,
    pub server_timestamp: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SubscriptionInfo {
    pub id: u32,
    pub publishing_interval: f64,
    pub monitored_items: Vec<MonitoredItemInfo>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MonitoredItemInfo {
    pub id: u32,
    pub node_id: String,
    pub display_name: String,
    pub sampling_interval: f64,
}

// ─── Method Types ────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MethodArgument {
    pub name: String,
    pub data_type: String,
    pub description: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MethodInfo {
    pub node_id: String,
    pub browse_name: String,
    pub display_name: String,
    pub description: String,
    pub input_arguments: Vec<MethodArgument>,
    pub output_arguments: Vec<MethodArgument>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TypedArgValue {
    pub value: String,
    pub data_type: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CallMethodRequest {
    pub object_node_id: String,
    pub method_node_id: String,
    pub input_arguments: Vec<TypedArgValue>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CallMethodResult {
    pub status_code: String,
    pub output_arguments: Vec<String>,
}

// ─── Event Types ─────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EventData {
    pub event_id: String,
    pub source_name: String,
    pub event_type: String,
    pub severity: u16,
    pub message: String,
    pub timestamp: String,
    pub receive_time: String,
    pub source_node_id: Option<String>,
}

// ─── Logging Types ───────────────────────────────────────────────

/// Response type for cursor-based backend log polling.
#[derive(Debug, Clone, Serialize)]
pub struct BackendLogResponse {
    pub entries: Vec<crate::logging::BackendLogEntry>,
    pub cursor: usize,
}
