use std::collections::HashMap;
use std::sync::Arc;
use std::sync::atomic::{AtomicU32, Ordering};

use tokio::sync::{Mutex, RwLock};

use crate::error::{AppError, AppResult};

use super::broker::EmbeddedBroker;
use super::client::MqttClientConnection;
use super::types::*;

// ─── Connection Backend ──────────────────────────────────────────

enum MqttBackend {
    Client(Arc<Mutex<MqttClientConnection>>),
    Broker(Arc<Mutex<EmbeddedBroker>>),
}

struct MqttConnectionState {
    config: MqttConnectionConfig,
    status: MqttConnectionStatus,
    last_error: Option<String>,
    backend: MqttBackend,
    /// Subscription tracking
    subscriptions: HashMap<u32, MqttSubState>,
}

struct MqttSubState {
    topic_filter: String,
    qos: MqttQoS,
    message_count: u64,
}

type SharedMqttState = Arc<RwLock<MqttConnectionState>>;

// ─── Manager ─────────────────────────────────────────────────────

pub struct MqttManager {
    connections: RwLock<HashMap<String, SharedMqttState>>,
    next_sub_id: AtomicU32,
}

impl MqttManager {
    pub fn new() -> Self {
        Self {
            connections: RwLock::new(HashMap::new()),
            next_sub_id: AtomicU32::new(1),
        }
    }

    async fn get_connection(&self, connection_id: &str) -> AppResult<SharedMqttState> {
        self.connections
            .read()
            .await
            .get(connection_id)
            .cloned()
            .ok_or_else(|| {
                AppError::not_found(format!("MQTT connection '{connection_id}' not found"))
            })
    }

    // ─── Connect / Disconnect ────────────────────────────────────

    pub async fn connect(&self, config: MqttConnectionConfig) -> AppResult<String> {
        let id = uuid::Uuid::new_v4().to_string();

        let backend = match config.mode {
            MqttMode::Client => {
                log::info!(
                    "MQTT: connecting client '{}' to {}:{}",
                    config.name,
                    config.host,
                    config.port
                );
                let conn = MqttClientConnection::connect(&config).await?;
                MqttBackend::Client(Arc::new(Mutex::new(conn)))
            }
            MqttMode::Broker => {
                let bind = config
                    .broker_bind_address
                    .as_deref()
                    .unwrap_or("0.0.0.0");
                log::info!(
                    "MQTT: starting embedded broker '{}' on {}:{}",
                    config.name,
                    bind,
                    config.port
                );
                let broker = EmbeddedBroker::start(
                    bind,
                    config.port,
                    config.broker_max_connections,
                )
                .await?;
                MqttBackend::Broker(Arc::new(Mutex::new(broker)))
            }
        };

        let state = Arc::new(RwLock::new(MqttConnectionState {
            config,
            status: MqttConnectionStatus::Connected,
            last_error: None,
            backend,
            subscriptions: HashMap::new(),
        }));

        self.connections.write().await.insert(id.clone(), state);
        Ok(id)
    }

    pub async fn disconnect(&self, connection_id: &str) -> AppResult<()> {
        let state = self
            .connections
            .write()
            .await
            .remove(connection_id)
            .ok_or_else(|| AppError::not_found("MQTT connection not found"))?;

        let guard = state.read().await;
        match &guard.backend {
            MqttBackend::Client(client) => {
                let client = client.lock().await;
                let _ = client.disconnect().await;
            }
            MqttBackend::Broker(broker) => {
                let broker = broker.lock().await;
                broker.stop();
            }
        }

        Ok(())
    }

    pub async fn disconnect_all(&self) {
        let all_states: Vec<SharedMqttState> = {
            let mut map = self.connections.write().await;
            map.drain().map(|(_, state)| state).collect()
        };

        for state in all_states {
            let guard = state.read().await;
            match &guard.backend {
                MqttBackend::Client(client) => {
                    let client = client.lock().await;
                    let _ = client.disconnect().await;
                }
                MqttBackend::Broker(broker) => {
                    let broker = broker.lock().await;
                    broker.stop();
                }
            }
        }
    }

    // ─── Connection Info ─────────────────────────────────────────

    pub async fn list_connections(&self) -> Vec<MqttConnectionInfo> {
        let entries: Vec<(String, SharedMqttState)> = self
            .connections
            .read()
            .await
            .iter()
            .map(|(id, state)| (id.clone(), state.clone()))
            .collect();

        let mut results = Vec::with_capacity(entries.len());
        for (id, state) in entries {
            let guard = state.read().await;
            results.push(MqttConnectionInfo {
                id,
                name: guard.config.name.clone(),
                mode: guard.config.mode,
                status: guard.status.clone(),
                host: guard.config.host.clone(),
                port: guard.config.port,
                client_id: guard
                    .config
                    .client_id
                    .clone()
                    .unwrap_or_default(),
                protocol_version: guard.config.protocol_version,
                last_error: guard.last_error.clone(),
                connected_clients: match &guard.backend {
                    MqttBackend::Broker(broker) => {
                        let b = broker.lock().await;
                        Some(b.active_connection_count())
                    }
                    _ => None,
                },
            });
        }

        results
    }

    pub async fn get_status(
        &self,
        connection_id: &str,
    ) -> AppResult<MqttConnectionStatus> {
        let state = self.get_connection(connection_id).await?;
        let mut guard = state.write().await;

        // Clone the client Arc (if any) to avoid borrow conflicts
        let client_arc = match &guard.backend {
            MqttBackend::Client(client) => Some(client.clone()),
            _ => None,
        };

        if let Some(client_arc) = client_arc {
            let client = client_arc.lock().await;
            if client.is_connected() {
                guard.status = MqttConnectionStatus::Connected;
                guard.last_error = None;
            } else if guard.status == MqttConnectionStatus::Connected {
                guard.status = MqttConnectionStatus::Reconnecting;
            }
        }
        // Broker is always "connected" while present

        Ok(guard.status.clone())
    }

    // ─── Subscribe / Unsubscribe ─────────────────────────────────

    pub async fn subscribe(
        &self,
        connection_id: &str,
        request: &MqttSubscribeRequest,
    ) -> AppResult<MqttSubscriptionInfo> {
        let state = self.get_connection(connection_id).await?;
        let mut guard = state.write().await;

        // Determine backend type and clone Arc if needed
        enum BackendKind {
            Client(Arc<Mutex<MqttClientConnection>>),
            Broker,
        }
        let kind = match &guard.backend {
            MqttBackend::Client(c) => BackendKind::Client(c.clone()),
            MqttBackend::Broker(_) => BackendKind::Broker,
        };

        match kind {
            BackendKind::Client(client) => {
                let client = client.lock().await;
                client
                    .subscribe(&request.topic_filter, request.qos)
                    .await?;
                drop(client);

                let sub_id = self.next_sub_id.fetch_add(1, Ordering::Relaxed);
                guard.subscriptions.insert(
                    sub_id,
                    MqttSubState {
                        topic_filter: request.topic_filter.clone(),
                        qos: request.qos,
                        message_count: 0,
                    },
                );

                Ok(MqttSubscriptionInfo {
                    id: sub_id,
                    topic_filter: request.topic_filter.clone(),
                    qos: request.qos,
                    message_count: 0,
                    active: true,
                })
            }
            BackendKind::Broker => {
                // Broker mode doesn't subscribe per se; it sees all messages.
                // We still track the "subscription" as a filter for UI purposes.
                let sub_id = self.next_sub_id.fetch_add(1, Ordering::Relaxed);
                guard.subscriptions.insert(
                    sub_id,
                    MqttSubState {
                        topic_filter: request.topic_filter.clone(),
                        qos: request.qos,
                        message_count: 0,
                    },
                );

                Ok(MqttSubscriptionInfo {
                    id: sub_id,
                    topic_filter: request.topic_filter.clone(),
                    qos: request.qos,
                    message_count: 0,
                    active: true,
                })
            }
        }
    }

    pub async fn unsubscribe(
        &self,
        connection_id: &str,
        subscription_id: u32,
    ) -> AppResult<()> {
        let state = self.get_connection(connection_id).await?;
        let mut guard = state.write().await;

        let sub = guard
            .subscriptions
            .remove(&subscription_id)
            .ok_or_else(|| AppError::not_found("Subscription not found"))?;

        match &guard.backend {
            MqttBackend::Client(client) => {
                let client = client.lock().await;
                client.unsubscribe(&sub.topic_filter).await?;
            }
            MqttBackend::Broker(_) => {
                // Nothing to do on the broker side
            }
        }

        Ok(())
    }

    pub async fn get_subscriptions(
        &self,
        connection_id: &str,
    ) -> AppResult<Vec<MqttSubscriptionInfo>> {
        let state = self.get_connection(connection_id).await?;
        let guard = state.read().await;

        Ok(guard
            .subscriptions
            .iter()
            .map(|(id, sub)| MqttSubscriptionInfo {
                id: *id,
                topic_filter: sub.topic_filter.clone(),
                qos: sub.qos,
                message_count: sub.message_count,
                active: true,
            })
            .collect())
    }

    // ─── Publish ─────────────────────────────────────────────────

    pub async fn publish(
        &self,
        connection_id: &str,
        request: &MqttPublishRequest,
    ) -> AppResult<()> {
        let state = self.get_connection(connection_id).await?;
        let guard = state.read().await;

        match &guard.backend {
            MqttBackend::Client(client) => {
                let client = client.lock().await;
                client
                    .publish(
                        &request.topic,
                        request.payload.as_bytes(),
                        request.qos,
                        request.retain,
                    )
                    .await
            }
            MqttBackend::Broker(_) => {
                // Publishing to the embedded broker would require a separate client
                Err(AppError::mqtt(
                    "Cannot publish directly from broker mode. Connect an MQTT client to the broker to publish messages.",
                ))
            }
        }
    }

    // ─── Poll Messages ───────────────────────────────────────────

    pub async fn poll_messages(
        &self,
        connection_id: &str,
    ) -> AppResult<MqttPollResponse> {
        let state = self.get_connection(connection_id).await?;
        let mut guard = state.write().await;

        let messages = match &guard.backend {
            MqttBackend::Client(client) => {
                let client = client.lock().await;
                client.poll_messages().await
            }
            MqttBackend::Broker(broker) => {
                let broker = broker.lock().await;
                broker.poll_messages().await
            }
        };

        // Increment per-subscription message counts by matching each message
        // topic against the subscription filters.
        for msg in &messages {
            for sub in guard.subscriptions.values_mut() {
                if mqtt_topic_matches(&sub.topic_filter, &msg.topic) {
                    sub.message_count += 1;
                }
            }
        }

        let topics_updated = !messages.is_empty();
        Ok(MqttPollResponse {
            messages,
            topics_updated,
        })
    }

    // ─── Topics ──────────────────────────────────────────────────

    pub async fn get_topics(
        &self,
        connection_id: &str,
    ) -> AppResult<Vec<MqttTopicInfo>> {
        let state = self.get_connection(connection_id).await?;
        let guard = state.read().await;

        match &guard.backend {
            MqttBackend::Broker(broker) => {
                let broker = broker.lock().await;
                Ok(broker.get_topics().await)
            }
            MqttBackend::Client(_) => {
                // Client mode builds topic list from received messages.
                // The frontend tracks topics from polled messages.
                Ok(Vec::new())
            }
        }
    }

    // ─── Broker Admin ────────────────────────────────────────────

    pub async fn get_broker_stats(
        &self,
        connection_id: &str,
    ) -> AppResult<BrokerStats> {
        let state = self.get_connection(connection_id).await?;
        let guard = state.read().await;

        match &guard.backend {
            MqttBackend::Broker(broker) => {
                let broker = broker.lock().await;
                Ok(broker.get_stats())
            }
            MqttBackend::Client(_) => Err(AppError::mqtt(
                "Broker stats are only available in broker mode",
            )),
        }
    }

    pub async fn get_broker_clients(
        &self,
        connection_id: &str,
    ) -> AppResult<Vec<BrokerClientInfo>> {
        let state = self.get_connection(connection_id).await?;
        let guard = state.read().await;

        match &guard.backend {
            MqttBackend::Broker(broker) => {
                let broker = broker.lock().await;
                Ok(broker.get_clients())
            }
            MqttBackend::Client(_) => Err(AppError::mqtt(
                "Broker clients are only available in broker mode",
            )),
        }
    }
}

impl Default for MqttManager {
    fn default() -> Self {
        Self::new()
    }
}

/// Check whether an MQTT topic matches a subscription filter per MQTT 3.1.1 Section 4.7.
///
/// - `+` matches exactly one topic level
/// - `#` matches zero or more remaining levels (must be last segment)
fn mqtt_topic_matches(filter: &str, topic: &str) -> bool {
    let filter_parts: Vec<&str> = filter.split('/').collect();
    let topic_parts: Vec<&str> = topic.split('/').collect();

    let mut fi = 0;
    let mut ti = 0;

    while fi < filter_parts.len() {
        let fp = filter_parts[fi];
        if fp == "#" {
            // '#' matches the rest of the topic
            return true;
        }
        if ti >= topic_parts.len() {
            return false;
        }
        if fp != "+" && fp != topic_parts[ti] {
            return false;
        }
        fi += 1;
        ti += 1;
    }

    // All filter parts consumed; topic must also be fully consumed
    fi == filter_parts.len() && ti == topic_parts.len()
}
