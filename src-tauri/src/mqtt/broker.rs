use std::collections::{HashMap, VecDeque};
use std::net::SocketAddr;
use std::sync::Arc;
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};

use rumqttd::{Broker, Config, ConnectionSettings, ConsoleSettings, Notification, RouterConfig, ServerSettings};
use tokio::sync::Mutex;
use tokio::task::JoinHandle;

use crate::error::{AppError, AppResult};
use super::types::*;
use super::simulator::detect_payload_format;

/// Maximum messages retained in the broker message buffer.
const MAX_BROKER_MESSAGES: usize = 10_000;

struct BrokerMessageBuffer {
    messages: VecDeque<MqttMessage>,
    topic_meta: HashMap<String, BrokerTopicMeta>,
    next_msg_id: u64,
}

struct BrokerTopicMeta {
    message_count: u64,
    last_payload_preview: Option<String>,
    last_timestamp: Option<String>,
}

pub struct EmbeddedBroker {
    _broker_handle: JoinHandle<()>,
    running: Arc<AtomicBool>,
    buffer: Arc<Mutex<BrokerMessageBuffer>>,
    start_time: chrono::DateTime<chrono::Utc>,
    bind_addr: SocketAddr,
    messages_received: Arc<AtomicU64>,
    messages_sent: Arc<AtomicU64>,
    bytes_received: Arc<AtomicU64>,
    bytes_sent: Arc<AtomicU64>,
}

impl EmbeddedBroker {
    pub async fn start(
        bind_address: &str,
        port: u16,
        _max_connections: Option<u32>,
    ) -> AppResult<Self> {
        let addr: SocketAddr = format!("{bind_address}:{port}")
            .parse()
            .map_err(|e| AppError::mqtt(format!("Invalid bind address: {e}")))?;

        let router_config = RouterConfig {
            max_segment_size: 10240,
            max_segment_count: 10,
            max_connections: 100,
            max_outgoing_packet_count: 200,
            initialized_filters: None,
            custom_segment: None,
            ..Default::default()
        };

        let mut servers = HashMap::new();
        servers.insert(
            "mqtt-tcp".to_string(),
            ServerSettings {
                name: "mqtt-tcp".to_string(),
                listen: addr,
                tls: None,
                next_connection_delay_ms: 0,
                connections: ConnectionSettings {
                    connection_timeout_ms: 5000,
                    max_payload_size: 262144,
                    max_inflight_count: 100,
                    auth: None,
                    dynamic_filters: false,
                    external_auth: None,
                },
            },
        );

        let config = Config {
            id: 0,
            router: router_config,
            v4: Some(servers.clone()),
            v5: None,
            ws: None,
            cluster: None,
            console: Some(ConsoleSettings::default()),
            bridge: None,
            prometheus: None,
            metrics: None,
        };

        let mut broker = Broker::new(config);
        // Get the link for intercepting messages before starting.
        let (mut link_tx, mut link_rx) = broker.link("iotui-monitor")
            .map_err(|e| AppError::mqtt(format!("Failed to create broker monitor link: {e}")))?;

        let running = Arc::new(AtomicBool::new(true));
        let buffer = Arc::new(Mutex::new(BrokerMessageBuffer {
            messages: VecDeque::with_capacity(MAX_BROKER_MESSAGES),
            topic_meta: HashMap::new(),
            next_msg_id: 1,
        }));
        let messages_received = Arc::new(AtomicU64::new(0));
        let messages_sent = Arc::new(AtomicU64::new(0));
        let bytes_received = Arc::new(AtomicU64::new(0));
        let bytes_sent = Arc::new(AtomicU64::new(0));

        let running_clone = running.clone();

        // Spawn the broker itself in a blocking thread since rumqttd::Broker::start is blocking
        let broker_handle = tokio::spawn(async move {
            // Start the broker in a separate thread
            let _broker_thread = std::thread::spawn(move || {
                if let Err(e) = broker.start() {
                    log::error!("MQTT broker stopped with error: {e}");
                }
            });

            // Keep the task alive while the broker runs
            while running_clone.load(Ordering::Relaxed) {
                tokio::time::sleep(std::time::Duration::from_secs(1)).await;
            }
        });

        // Spawn the monitor that subscribes to all topics to intercept messages
        let buffer_clone = buffer.clone();
        let msgs_recv = messages_received.clone();
        let bytes_recv = bytes_received.clone();
        tokio::spawn(async move {
            // Subscribe to wildcard to see all traffic
            if let Err(e) = link_tx.subscribe("#") {
                log::warn!("Broker monitor failed to subscribe: {e}");
                return;
            }

            loop {
                match link_rx.recv() {
                    Ok(Some(notification)) => {
                        if let Notification::Forward(forward) = notification {
                            let topic_bytes = forward.publish.topic.clone();
                            let topic = String::from_utf8_lossy(&topic_bytes).to_string();
                            let payload_bytes = forward.publish.payload.to_vec();
                            let payload_str = String::from_utf8_lossy(&payload_bytes).to_string();
                            let format = detect_payload_format(&payload_str);
                            let payload_size = payload_bytes.len();

                            let mut buf = buffer_clone.blocking_lock();
                            let msg_id = buf.next_msg_id;
                            buf.next_msg_id += 1;

                            let timestamp = chrono::Utc::now()
                                .format("%Y-%m-%dT%H:%M:%S%.3fZ")
                                .to_string();

                            let msg = MqttMessage {
                                id: format!("broker-{msg_id}"),
                                topic: topic.clone(),
                                payload: payload_str.clone(),
                                payload_format: format,
                                qos: MqttQoS::AtMostOnce,
                                retain: forward.publish.retain,
                                timestamp: timestamp.clone(),
                                payload_size_bytes: payload_size,
                            };

                            // Update topic metadata
                            let meta = buf.topic_meta.entry(topic).or_insert_with(|| BrokerTopicMeta {
                                message_count: 0,
                                last_payload_preview: None,
                                last_timestamp: None,
                            });
                            meta.message_count += 1;
                            meta.last_payload_preview = Some(if payload_str.len() > 100 {
                                format!("{}...", &payload_str[..100])
                            } else {
                                payload_str
                            });
                            meta.last_timestamp = Some(timestamp);

                            if buf.messages.len() >= MAX_BROKER_MESSAGES {
                                buf.messages.pop_front();
                            }
                            buf.messages.push_back(msg);

                            msgs_recv.fetch_add(1, Ordering::Relaxed);
                            bytes_recv.fetch_add(payload_size as u64, Ordering::Relaxed);
                        }
                    }
                    Ok(None) => {
                        // No notification, keep waiting
                    }
                    Err(e) => {
                        log::warn!("Broker monitor recv error: {e}");
                        std::thread::sleep(std::time::Duration::from_millis(100));
                    }
                }
            }
        });

        log::info!("Embedded MQTT broker started on {addr}");

        Ok(Self {
            _broker_handle: broker_handle,
            running,
            buffer,
            start_time: chrono::Utc::now(),
            bind_addr: addr,
            messages_received,
            messages_sent,
            bytes_received,
            bytes_sent,
        })
    }

    pub fn stop(&self) {
        self.running.store(false, Ordering::Relaxed);
        log::info!("Embedded MQTT broker stopping on {}", self.bind_addr);
    }

    pub async fn poll_messages(&self) -> Vec<MqttMessage> {
        let mut buf = self.buffer.lock().await;
        buf.messages.drain(..).collect()
    }

    pub async fn get_topics(&self) -> Vec<MqttTopicInfo> {
        let buf = self.buffer.lock().await;
        buf.topic_meta
            .iter()
            .map(|(topic, meta)| MqttTopicInfo {
                topic: topic.clone(),
                message_count: meta.message_count,
                last_payload_preview: meta.last_payload_preview.clone(),
                last_timestamp: meta.last_timestamp.clone(),
                subscriber_count: 0,
                retained_payload: None,
            })
            .collect()
    }

    pub fn get_stats(&self) -> BrokerStats {
        let uptime = (chrono::Utc::now() - self.start_time).num_seconds().max(0) as u64;
        BrokerStats {
            total_connections: 0,
            active_connections: 0,
            messages_received: self.messages_received.load(Ordering::Relaxed),
            messages_sent: self.messages_sent.load(Ordering::Relaxed),
            subscriptions_active: 0,
            bytes_received: self.bytes_received.load(Ordering::Relaxed),
            bytes_sent: self.bytes_sent.load(Ordering::Relaxed),
            uptime_secs: uptime,
            retained_messages: 0,
        }
    }

    pub fn get_clients(&self) -> Vec<BrokerClientInfo> {
        // rumqttd doesn't expose connected clients easily through the link API.
        // Return empty for now; real client tracking would require custom hooks.
        Vec::new()
    }
}

impl Drop for EmbeddedBroker {
    fn drop(&mut self) {
        self.running.store(false, Ordering::Relaxed);
    }
}
