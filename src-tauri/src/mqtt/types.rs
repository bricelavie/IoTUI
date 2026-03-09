use serde::{Deserialize, Serialize};
use std::fmt;

// ─── Mode & QoS ──────────────────────────────────────────────────

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum MqttMode {
    Client,
    Broker,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum MqttProtocolVersion {
    V311,
    V5,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum MqttQoS {
    #[serde(rename = "0")]
    AtMostOnce,
    #[serde(rename = "1")]
    AtLeastOnce,
    #[serde(rename = "2")]
    ExactlyOnce,
}

impl MqttQoS {
    pub fn as_u8(&self) -> u8 {
        match self {
            Self::AtMostOnce => 0,
            Self::AtLeastOnce => 1,
            Self::ExactlyOnce => 2,
        }
    }

    pub fn from_u8(v: u8) -> Self {
        match v {
            0 => Self::AtMostOnce,
            1 => Self::AtLeastOnce,
            _ => Self::ExactlyOnce,
        }
    }
}

// ─── Connection Types ────────────────────────────────────────────

#[derive(Clone, Serialize, Deserialize)]
pub struct MqttTlsConfig {
    pub ca_cert_path: Option<String>,
    pub client_cert_path: Option<String>,
    pub client_key_path: Option<String>,
    pub accept_invalid_certs: bool,
}

#[derive(Clone, Serialize, Deserialize)]
pub struct MqttLastWill {
    pub topic: String,
    pub payload: String,
    pub qos: MqttQoS,
    pub retain: bool,
}

#[derive(Clone, Serialize, Deserialize)]
pub struct MqttConnectionConfig {
    pub name: String,
    pub mode: MqttMode,
    pub host: String,
    pub port: u16,
    pub client_id: Option<String>,
    pub protocol_version: MqttProtocolVersion,
    pub auth_type: MqttAuthType,
    pub username: Option<String>,
    #[serde(skip_serializing)]
    pub password: Option<String>,
    pub keep_alive_secs: Option<u16>,
    pub clean_session: bool,
    pub tls: Option<MqttTlsConfig>,
    pub last_will: Option<MqttLastWill>,
    /// When true, use the built-in simulator instead of connecting to a real broker.
    #[serde(default)]
    pub use_simulator: bool,
    /// Broker-mode: bind address (e.g. "0.0.0.0")
    pub broker_bind_address: Option<String>,
    /// Broker-mode: max concurrent client connections
    pub broker_max_connections: Option<u32>,
}

impl fmt::Debug for MqttConnectionConfig {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.debug_struct("MqttConnectionConfig")
            .field("name", &self.name)
            .field("mode", &self.mode)
            .field("host", &self.host)
            .field("port", &self.port)
            .field("client_id", &self.client_id)
            .field("protocol_version", &self.protocol_version)
            .field("auth_type", &self.auth_type)
            .field("username", &self.username)
            .field("password", &"<redacted>")
            .field("keep_alive_secs", &self.keep_alive_secs)
            .field("clean_session", &self.clean_session)
            .field("use_simulator", &self.use_simulator)
            .finish()
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum MqttAuthType {
    Anonymous,
    UsernamePassword,
    Certificate,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum MqttConnectionStatus {
    Disconnected,
    Connecting,
    Connected,
    Reconnecting,
    Error,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MqttConnectionInfo {
    pub id: String,
    pub name: String,
    pub mode: MqttMode,
    pub status: MqttConnectionStatus,
    pub host: String,
    pub port: u16,
    pub client_id: String,
    pub protocol_version: MqttProtocolVersion,
    pub is_simulator: bool,
    pub last_error: Option<String>,
    /// Number of connected clients (broker mode only)
    pub connected_clients: Option<u32>,
}

// ─── Subscription Types ──────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MqttSubscribeRequest {
    pub topic_filter: String,
    pub qos: MqttQoS,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MqttSubscriptionInfo {
    pub id: u32,
    pub topic_filter: String,
    pub qos: MqttQoS,
    pub message_count: u64,
    pub active: bool,
}

// ─── Message Types ───────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MqttMessage {
    pub id: String,
    pub topic: String,
    pub payload: String,
    pub payload_format: PayloadFormat,
    pub qos: MqttQoS,
    pub retain: bool,
    pub timestamp: String,
    pub payload_size_bytes: usize,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum PayloadFormat {
    Text,
    Json,
    Hex,
    Base64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MqttPublishRequest {
    pub topic: String,
    pub payload: String,
    pub qos: MqttQoS,
    pub retain: bool,
}

// ─── Topic Types ─────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MqttTopicInfo {
    pub topic: String,
    pub message_count: u64,
    pub last_payload_preview: Option<String>,
    pub last_timestamp: Option<String>,
    pub subscriber_count: u32,
    pub retained_payload: Option<String>,
}

// ─── Broker Types ────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BrokerClientInfo {
    pub client_id: String,
    pub connected_at: String,
    pub subscriptions: Vec<String>,
    pub messages_in: u64,
    pub messages_out: u64,
}

#[derive(Debug, Default, Clone, Serialize, Deserialize)]
pub struct BrokerStats {
    pub total_connections: u64,
    pub active_connections: u32,
    pub messages_received: u64,
    pub messages_sent: u64,
    pub subscriptions_active: u32,
    pub bytes_received: u64,
    pub bytes_sent: u64,
    pub uptime_secs: u64,
    pub retained_messages: u32,
}

// ─── Poll Response ───────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MqttPollResponse {
    pub messages: Vec<MqttMessage>,
    pub topics_updated: bool,
}
