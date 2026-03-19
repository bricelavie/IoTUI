use std::collections::{HashMap, HashSet, VecDeque};
use std::net::SocketAddr;
use std::sync::Arc;
use std::sync::atomic::{AtomicBool, AtomicU32, AtomicU64, Ordering};

use rumqttd::{Broker, Config, ConnectionSettings, Meter, Notification, RouterConfig, ServerSettings};
use tokio::sync::Mutex;
use tokio::task::JoinHandle;

use crate::error::{AppError, AppResult};
use super::types::*;

/// Maximum messages retained in the broker message buffer.
const MAX_BROKER_MESSAGES: usize = 10_000;

struct BrokerMessageBuffer {
    messages: VecDeque<MqttMessage>,
    topic_meta: HashMap<String, BrokerTopicMeta>,
    retained_topics: HashSet<String>,
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
    total_connections: Arc<AtomicU64>,
    active_connections: Arc<AtomicU32>,
    subscriptions_active: Arc<AtomicU32>,
}

impl EmbeddedBroker {
    pub async fn start(
        bind_address: &str,
        port: u16,
        max_connections: Option<u32>,
    ) -> AppResult<Self> {
        let addr: SocketAddr = format!("{bind_address}:{port}")
            .parse()
            .map_err(|e| AppError::mqtt(format!("Invalid bind address: {e}")))?;

        let router_config = RouterConfig {
            max_segment_size: 10240,
            max_segment_count: 10,
            max_connections: max_connections.unwrap_or(100) as usize,
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
                    dynamic_filters: true,
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
            console: None,
            bridge: None,
            prometheus: None,
            metrics: None,
        };

        let mut broker = Broker::new(config);

        // Get the link for intercepting messages before starting.
        let (mut link_tx, mut link_rx) = broker.link("iotui-monitor")
            .map_err(|e| AppError::mqtt(format!("Failed to create broker monitor link: {e}")))?;

        // Get the meters link for tracking connection/subscription stats.
        let meters_link = broker.meters()
            .map_err(|e| AppError::mqtt(format!("Failed to create broker meters link: {e}")))?;

        let running = Arc::new(AtomicBool::new(true));
        let buffer = Arc::new(Mutex::new(BrokerMessageBuffer {
            messages: VecDeque::with_capacity(MAX_BROKER_MESSAGES),
            topic_meta: HashMap::new(),
            retained_topics: HashSet::new(),
            next_msg_id: 1,
        }));
        let messages_received = Arc::new(AtomicU64::new(0));
        let messages_sent = Arc::new(AtomicU64::new(0));
        let bytes_received = Arc::new(AtomicU64::new(0));
        let bytes_sent = Arc::new(AtomicU64::new(0));
        let total_connections = Arc::new(AtomicU64::new(0));
        let active_connections = Arc::new(AtomicU32::new(0));
        let subscriptions_active = Arc::new(AtomicU32::new(0));

        let running_clone = running.clone();

        // Spawn the broker itself in a blocking thread since rumqttd::Broker::start is blocking
        let broker_handle = tokio::spawn(async move {
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

        // Spawn the message monitor on a dedicated OS thread since link_rx.recv()
        // is a blocking call and must not run on the tokio async runtime.
        //
        // NOTE: link_rx.recv() blocks indefinitely waiting for the next notification.
        // When the `running` flag is set to false, this thread will only exit once
        // the next notification arrives (or recv returns an error). There is no
        // try_recv or recv_timeout API available on rumqttd 0.19's LinkRx. This
        // means the monitor thread may hang until the process exits if no more
        // messages flow through the broker after stop() is called.
        let buffer_clone = buffer.clone();
        let msgs_recv = messages_received.clone();
        let bytes_recv = bytes_received.clone();
        let msgs_sent = messages_sent.clone();
        let bytes_sent_clone = bytes_sent.clone();
        let running_monitor = running.clone();
        std::thread::spawn(move || {
            // Subscribe to wildcard to see all traffic
            if let Err(e) = link_tx.subscribe("#") {
                log::warn!("Broker monitor failed to subscribe: {e}");
                return;
            }

            while running_monitor.load(Ordering::Relaxed) {
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

                            // Note: Publish.qos is pub(crate) in rumqttd so we cannot read the
                            // original QoS level. The monitor link subscribes at QoS 0 so all
                            // forwarded messages arrive at QoS 0 regardless of original QoS.
                            // Similarly, the subscribe call sets preserve_retain: false and
                            // retain_forward_rule: Never, so retain is always false here.
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
                            let meta = buf.topic_meta.entry(topic.clone()).or_insert_with(|| BrokerTopicMeta {
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

                            // Track retained messages via topic metadata.
                            // Note: the monitor link's subscribe sets retain_forward_rule: Never,
                            // so forward.publish.retain will typically be false. We track retained
                            // status from the publish flag as a best-effort approximation.
                            if forward.publish.retain {
                                if msg.payload.is_empty() {
                                    // Empty payload with retain = clear retained message
                                    buf.retained_topics.remove(&topic);
                                } else {
                                    buf.retained_topics.insert(topic);
                                }
                            }

                            if buf.messages.len() >= MAX_BROKER_MESSAGES {
                                buf.messages.pop_front();
                            }
                            buf.messages.push_back(msg);

                            // Increment both received and sent counters.
                            // Each forwarded notification represents a message received by the broker
                            // from a publishing client AND sent by the broker to at least one subscriber.
                            // NOTE: This is an approximation. The actual fan-out count (number of
                            // subscribers who received each message) is not available through
                            // rumqttd 0.19's Forward notification. messages_sent therefore equals
                            // messages_received as a lower bound, not the true delivery count.
                            msgs_recv.fetch_add(1, Ordering::Relaxed);
                            bytes_recv.fetch_add(payload_size as u64, Ordering::Relaxed);
                            msgs_sent.fetch_add(1, Ordering::Relaxed);
                            bytes_sent_clone.fetch_add(payload_size as u64, Ordering::Relaxed);
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

        // Spawn a meters polling thread to track connection and subscription counts.
        // The RouterMeter from rumqttd provides total_connections and total_subscriptions.
        let running_meters = running.clone();
        let total_conns = total_connections.clone();
        let active_conns = active_connections.clone();
        let subs_active = subscriptions_active.clone();
        std::thread::spawn(move || {
            while running_meters.load(Ordering::Relaxed) {
                match meters_link.recv() {
                    Ok(meters) => {
                        for meter in meters {
                            if let Meter::Router(_, router_meter) = meter {
                                let current = router_meter.total_connections as u32;
                                // Subtract 1 for the monitor link itself
                                let external = current.saturating_sub(1);
                                let prev = active_conns.swap(external, Ordering::Relaxed);
                                // Track cumulative total: if active count increased, new
                                // connections arrived since last check.
                                if external > prev {
                                    total_conns.fetch_add((external - prev) as u64, Ordering::Relaxed);
                                }
                                // Subtract 1 for the monitor's own "#" subscription
                                let sub_count = (router_meter.total_subscriptions as u32).saturating_sub(1);
                                subs_active.store(sub_count, Ordering::Relaxed);
                            }
                        }
                    }
                    Err(_) => {
                        // try_recv returned no data, sleep and retry
                    }
                }
                std::thread::sleep(std::time::Duration::from_secs(1));
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
            total_connections,
            active_connections,
            subscriptions_active,
        })
    }

    /// Signal the broker to stop.
    ///
    /// **Limitation**: `rumqttd::Broker::start()` is a blocking call that runs in
    /// a detached OS thread with no built-in shutdown mechanism. Setting the
    /// `running` flag to `false` will stop the monitor and meters threads, but
    /// the broker's TCP listener and router will continue running until the
    /// process exits. The TCP port remains bound, so restarting a broker on the
    /// same port within the same process is not possible.
    pub fn stop(&self) {
        self.running.store(false, Ordering::Relaxed);
        log::info!("Embedded MQTT broker stopping on {}", self.bind_addr);
    }

    /// Drain all buffered messages.
    ///
    /// NOTE: This destructively removes messages from the buffer. If the caller
    /// fails to process them (e.g. IPC error), those messages are lost. A more
    /// robust approach would use cursor-based polling with explicit acknowledgment,
    /// but the current Tauri IPC is reliable enough within the same process.
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

    pub async fn get_stats(&self) -> BrokerStats {
        let uptime = (chrono::Utc::now() - self.start_time).num_seconds().max(0) as u64;
        BrokerStats {
            total_connections: self.total_connections.load(Ordering::Relaxed),
            active_connections: self.active_connections.load(Ordering::Relaxed),
            messages_received: self.messages_received.load(Ordering::Relaxed),
            messages_sent: self.messages_sent.load(Ordering::Relaxed),
            subscriptions_active: self.subscriptions_active.load(Ordering::Relaxed),
            bytes_received: self.bytes_received.load(Ordering::Relaxed),
            bytes_sent: self.bytes_sent.load(Ordering::Relaxed),
            uptime_secs: uptime,
            retained_messages: self.buffer.lock().await.retained_topics.len() as u32,
        }
    }

    pub fn get_clients(&self) -> Vec<BrokerClientInfo> {
        // rumqttd 0.19 does not expose individual client information through
        // the link or meters API. The Notification enum only contains Forward
        // and Disconnect variants (no Connect with client_id). Connection
        // counts are tracked via the RouterMeter. To get individual client
        // details, rumqttd would need to be extended or replaced with a broker
        // that exposes a richer management API.
        Vec::new()
    }

    pub fn active_connection_count(&self) -> u32 {
        self.active_connections.load(Ordering::Relaxed)
    }
}

impl Drop for EmbeddedBroker {
    fn drop(&mut self) {
        self.running.store(false, Ordering::Relaxed);
    }
}
