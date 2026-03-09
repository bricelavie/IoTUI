use chrono::Utc;
use parking_lot::Mutex;
use rand::Rng;
use std::collections::{HashMap, VecDeque};

use super::types::*;

/// Maximum messages to retain per topic in the simulator.
const MAX_MESSAGES_PER_TOPIC: usize = 200;
/// Maximum total messages across all topics in the message buffer.
const MAX_TOTAL_MESSAGES: usize = 5000;

// ─── Simulated Topic Definitions ─────────────────────────────────

struct SimTopic {
    topic: &'static str,
    generator: TopicGenerator,
    interval_ms: u64,
}

enum TopicGenerator {
    /// Sine wave with amplitude and offset
    Sine {
        amplitude: f64,
        offset: f64,
        period_secs: f64,
    },
    /// Random walk around a center value
    RandomWalk { center: f64, step: f64 },
    /// Discrete values from a set
    Discrete(&'static [&'static str]),
    /// Counter that increments
    Counter,
    /// JSON payload with multiple fields
    JsonSensor {
        temp_center: f64,
        humidity_center: f64,
    },
    /// Boolean toggle
    Toggle,
}

static SIM_TOPICS: &[SimTopic] = &[
    SimTopic {
        topic: "factory/line1/temperature",
        generator: TopicGenerator::Sine {
            amplitude: 15.0,
            offset: 65.0,
            period_secs: 30.0,
        },
        interval_ms: 1000,
    },
    SimTopic {
        topic: "factory/line1/pressure",
        generator: TopicGenerator::Sine {
            amplitude: 5.0,
            offset: 101.3,
            period_secs: 45.0,
        },
        interval_ms: 2000,
    },
    SimTopic {
        topic: "factory/line1/vibration",
        generator: TopicGenerator::RandomWalk {
            center: 2.5,
            step: 0.3,
        },
        interval_ms: 500,
    },
    SimTopic {
        topic: "factory/line1/status",
        generator: TopicGenerator::Discrete(&[
            "running",
            "idle",
            "running",
            "running",
            "maintenance",
        ]),
        interval_ms: 10000,
    },
    SimTopic {
        topic: "factory/line2/temperature",
        generator: TopicGenerator::Sine {
            amplitude: 10.0,
            offset: 72.0,
            period_secs: 25.0,
        },
        interval_ms: 1000,
    },
    SimTopic {
        topic: "factory/line2/throughput",
        generator: TopicGenerator::Counter,
        interval_ms: 3000,
    },
    SimTopic {
        topic: "sensors/humidity/zone1",
        generator: TopicGenerator::RandomWalk {
            center: 45.0,
            step: 1.5,
        },
        interval_ms: 2000,
    },
    SimTopic {
        topic: "sensors/humidity/zone2",
        generator: TopicGenerator::RandomWalk {
            center: 52.0,
            step: 2.0,
        },
        interval_ms: 2000,
    },
    SimTopic {
        topic: "sensors/co2/lobby",
        generator: TopicGenerator::Sine {
            amplitude: 100.0,
            offset: 450.0,
            period_secs: 60.0,
        },
        interval_ms: 5000,
    },
    SimTopic {
        topic: "devices/gateway01/heartbeat",
        generator: TopicGenerator::Counter,
        interval_ms: 5000,
    },
    SimTopic {
        topic: "devices/gateway01/status",
        generator: TopicGenerator::JsonSensor {
            temp_center: 42.0,
            humidity_center: 30.0,
        },
        interval_ms: 3000,
    },
    SimTopic {
        topic: "alerts/fire_alarm/building_a",
        generator: TopicGenerator::Toggle,
        interval_ms: 30000,
    },
    SimTopic {
        topic: "alerts/door_sensor/entrance",
        generator: TopicGenerator::Toggle,
        interval_ms: 8000,
    },
    SimTopic {
        topic: "$SYS/broker/uptime",
        generator: TopicGenerator::Counter,
        interval_ms: 10000,
    },
    SimTopic {
        topic: "$SYS/broker/clients/connected",
        generator: TopicGenerator::RandomWalk {
            center: 12.0,
            step: 1.0,
        },
        interval_ms: 5000,
    },
];

// ─── Internal State ──────────────────────────────────────────────

struct TopicState {
    message_count: u64,
    last_value: f64,
    counter: u64,
    toggle_state: bool,
    last_generate_ms: u64,
}

struct SubscriptionState {
    id: u32,
    topic_filter: String,
    qos: MqttQoS,
    message_count: u64,
    active: bool,
}

struct SimState {
    topic_states: HashMap<String, TopicState>,
    subscriptions: Vec<SubscriptionState>,
    /// Ring buffer of all messages (for polling)
    message_buffer: VecDeque<MqttMessage>,
    /// Per-topic metadata
    topic_meta: HashMap<String, TopicMeta>,
    /// Retained messages per topic
    retained: HashMap<String, MqttMessage>,
    /// Published messages from user (also delivered to matching subscriptions)
    user_published: Vec<MqttMessage>,
    /// Simulated broker clients
    broker_clients: Vec<SimBrokerClient>,
    next_sub_id: u32,
    next_msg_id: u64,
    start_time: chrono::DateTime<Utc>,
    stats: BrokerStats,
}

struct TopicMeta {
    message_count: u64,
    last_payload_preview: Option<String>,
    last_timestamp: Option<String>,
    subscriber_count: u32,
}

struct SimBrokerClient {
    client_id: String,
    connected_at: String,
    subscriptions: Vec<String>,
    messages_in: u64,
    messages_out: u64,
}

// ─── Simulator ───────────────────────────────────────────────────

pub struct MqttSimulator {
    state: Mutex<SimState>,
}

impl MqttSimulator {
    pub fn new() -> Self {
        let now = Utc::now();
        let mut topic_states = HashMap::new();
        for sim in SIM_TOPICS {
            topic_states.insert(
                sim.topic.to_string(),
                TopicState {
                    message_count: 0,
                    last_value: match &sim.generator {
                        TopicGenerator::Sine { offset, .. } => *offset,
                        TopicGenerator::RandomWalk { center, .. } => *center,
                        _ => 0.0,
                    },
                    counter: 0,
                    toggle_state: false,
                    last_generate_ms: 0,
                },
            );
        }

        // Pre-populate simulated broker clients
        let broker_clients = vec![
            SimBrokerClient {
                client_id: "plc-controller-01".to_string(),
                connected_at: now.format("%Y-%m-%dT%H:%M:%S%.3fZ").to_string(),
                subscriptions: vec!["factory/line1/#".to_string()],
                messages_in: 0,
                messages_out: 0,
            },
            SimBrokerClient {
                client_id: "sensor-gateway-gw01".to_string(),
                connected_at: now.format("%Y-%m-%dT%H:%M:%S%.3fZ").to_string(),
                subscriptions: vec!["sensors/#".to_string(), "devices/gateway01/#".to_string()],
                messages_in: 0,
                messages_out: 0,
            },
            SimBrokerClient {
                client_id: "alarm-monitor".to_string(),
                connected_at: now.format("%Y-%m-%dT%H:%M:%S%.3fZ").to_string(),
                subscriptions: vec!["alerts/#".to_string()],
                messages_in: 0,
                messages_out: 0,
            },
            SimBrokerClient {
                client_id: "dashboard-app".to_string(),
                connected_at: now.format("%Y-%m-%dT%H:%M:%S%.3fZ").to_string(),
                subscriptions: vec![
                    "factory/#".to_string(),
                    "sensors/#".to_string(),
                    "$SYS/#".to_string(),
                ],
                messages_in: 0,
                messages_out: 0,
            },
        ];

        Self {
            state: Mutex::new(SimState {
                topic_states,
                subscriptions: Vec::new(),
                message_buffer: VecDeque::with_capacity(MAX_TOTAL_MESSAGES),
                topic_meta: HashMap::new(),
                retained: HashMap::new(),
                user_published: Vec::new(),
                broker_clients,
                next_sub_id: 1,
                next_msg_id: 1,
                start_time: now,
                stats: BrokerStats::default(),
            }),
        }
    }

    fn now_str() -> String {
        Utc::now().format("%Y-%m-%dT%H:%M:%S%.3fZ").to_string()
    }

    fn elapsed_secs(start: chrono::DateTime<Utc>) -> f64 {
        (Utc::now() - start).num_milliseconds() as f64 / 1000.0
    }

    fn elapsed_ms(start: chrono::DateTime<Utc>) -> u64 {
        (Utc::now() - start).num_milliseconds().max(0) as u64
    }

    /// Generate any pending simulated messages based on elapsed time.
    fn tick(state: &mut SimState) {
        let elapsed_ms = Self::elapsed_ms(state.start_time);
        let elapsed_secs = elapsed_ms as f64 / 1000.0;
        let mut rng = rand::thread_rng();

        for sim in SIM_TOPICS {
            let topic_state = match state.topic_states.get_mut(sim.topic) {
                Some(s) => s,
                None => continue,
            };

            // Check if enough time has passed for this topic
            if elapsed_ms.saturating_sub(topic_state.last_generate_ms) < sim.interval_ms {
                continue;
            }
            topic_state.last_generate_ms = elapsed_ms;

            let (payload, format) = match &sim.generator {
                TopicGenerator::Sine {
                    amplitude,
                    offset,
                    period_secs,
                } => {
                    let val = offset
                        + amplitude
                            * (2.0 * std::f64::consts::PI * elapsed_secs / period_secs).sin();
                    let val = (val * 100.0).round() / 100.0;
                    topic_state.last_value = val;
                    (format!("{val}"), PayloadFormat::Text)
                }
                TopicGenerator::RandomWalk { center, step } => {
                    let delta: f64 = rng.gen_range(-step..=*step);
                    let mut val = topic_state.last_value + delta;
                    // Mean-revert gently
                    val += (center - val) * 0.05;
                    val = (val * 100.0).round() / 100.0;
                    topic_state.last_value = val;
                    (format!("{val}"), PayloadFormat::Text)
                }
                TopicGenerator::Discrete(values) => {
                    let idx = rng.gen_range(0..values.len());
                    (values[idx].to_string(), PayloadFormat::Text)
                }
                TopicGenerator::Counter => {
                    topic_state.counter += 1;
                    (format!("{}", topic_state.counter), PayloadFormat::Text)
                }
                TopicGenerator::JsonSensor {
                    temp_center,
                    humidity_center,
                } => {
                    let temp = temp_center + rng.gen_range(-3.0..3.0);
                    let hum = humidity_center + rng.gen_range(-5.0..5.0);
                    let payload = format!(
                        r#"{{"temperature":{:.1},"humidity":{:.1},"battery":{},"rssi":{}}}"#,
                        temp,
                        hum,
                        rng.gen_range(60..100),
                        rng.gen_range(-90..-30)
                    );
                    (payload, PayloadFormat::Json)
                }
                TopicGenerator::Toggle => {
                    topic_state.toggle_state = !topic_state.toggle_state;
                    (
                        if topic_state.toggle_state {
                            "true"
                        } else {
                            "false"
                        }
                        .to_string(),
                        PayloadFormat::Text,
                    )
                }
            };

            topic_state.message_count += 1;
            let msg_id = state.next_msg_id;
            state.next_msg_id += 1;

            let timestamp = Self::now_str();
            let payload_size = payload.len();

            let msg = MqttMessage {
                id: format!("sim-{msg_id}"),
                topic: sim.topic.to_string(),
                payload: payload.clone(),
                payload_format: format,
                qos: MqttQoS::AtMostOnce,
                retain: false,
                timestamp: timestamp.clone(),
                payload_size_bytes: payload_size,
            };

            // Update topic metadata
            let meta = state
                .topic_meta
                .entry(sim.topic.to_string())
                .or_insert_with(|| TopicMeta {
                    message_count: 0,
                    last_payload_preview: None,
                    last_timestamp: None,
                    subscriber_count: 0,
                });
            meta.message_count += 1;
            meta.last_payload_preview = Some(if payload.len() > 100 {
                format!("{}...", &payload[..100])
            } else {
                payload.clone()
            });
            meta.last_timestamp = Some(timestamp);

            // Update subscription message counts
            for sub in &mut state.subscriptions {
                if sub.active && topic_matches(&sub.topic_filter, sim.topic) {
                    sub.message_count += 1;
                }
            }

            // Update broker stats
            state.stats.messages_received += 1;
            state.stats.messages_sent += 1;
            state.stats.bytes_received += payload_size as u64;
            state.stats.bytes_sent += payload_size as u64;

            // Update simulated broker client stats
            for client in &mut state.broker_clients {
                for sub_filter in &client.subscriptions {
                    if topic_matches(sub_filter, sim.topic) {
                        client.messages_out += 1;
                        break;
                    }
                }
            }

            // Push to buffer
            if state.message_buffer.len() >= MAX_TOTAL_MESSAGES {
                state.message_buffer.pop_front();
            }
            state.message_buffer.push_back(msg);
        }
    }

    // ─── Public API ──────────────────────────────────────────────

    pub fn subscribe(&self, request: &MqttSubscribeRequest) -> MqttSubscriptionInfo {
        let mut state = self.state.lock();
        let id = state.next_sub_id;
        state.next_sub_id += 1;

        // Count matching subscribers in topic meta
        for (topic, meta) in &mut state.topic_meta {
            if topic_matches(&request.topic_filter, topic) {
                meta.subscriber_count += 1;
            }
        }

        let sub = SubscriptionState {
            id,
            topic_filter: request.topic_filter.clone(),
            qos: request.qos,
            message_count: 0,
            active: true,
        };

        state.subscriptions.push(sub);
        state.stats.subscriptions_active =
            state.subscriptions.iter().filter(|s| s.active).count() as u32;

        MqttSubscriptionInfo {
            id,
            topic_filter: request.topic_filter.clone(),
            qos: request.qos,
            message_count: 0,
            active: true,
        }
    }

    pub fn unsubscribe(&self, subscription_id: u32) {
        let mut state = self.state.lock();
        if let Some(pos) = state
            .subscriptions
            .iter()
            .position(|s| s.id == subscription_id)
        {
            let filter = state.subscriptions[pos].topic_filter.clone();
            state.subscriptions.remove(pos);
            // Decrement subscriber count
            for (topic, meta) in &mut state.topic_meta {
                if topic_matches(&filter, topic) {
                    meta.subscriber_count = meta.subscriber_count.saturating_sub(1);
                }
            }
            state.stats.subscriptions_active =
                state.subscriptions.iter().filter(|s| s.active).count() as u32;
        }
    }

    pub fn publish(&self, request: &MqttPublishRequest) {
        let mut state = self.state.lock();
        let msg_id = state.next_msg_id;
        state.next_msg_id += 1;

        let format = detect_payload_format(&request.payload);
        let timestamp = Self::now_str();

        let msg = MqttMessage {
            id: format!("pub-{msg_id}"),
            topic: request.topic.clone(),
            payload: request.payload.clone(),
            payload_format: format,
            qos: request.qos,
            retain: request.retain,
            timestamp: timestamp.clone(),
            payload_size_bytes: request.payload.len(),
        };

        // Store retained
        if request.retain {
            state.retained.insert(request.topic.clone(), msg.clone());
        }

        // Update topic metadata
        let meta = state
            .topic_meta
            .entry(request.topic.clone())
            .or_insert_with(|| TopicMeta {
                message_count: 0,
                last_payload_preview: None,
                last_timestamp: None,
                subscriber_count: 0,
            });
        meta.message_count += 1;
        meta.last_payload_preview = Some(if request.payload.len() > 100 {
            format!("{}...", &request.payload[..100])
        } else {
            request.payload.clone()
        });
        meta.last_timestamp = Some(timestamp);

        // Update subscription counts
        for sub in &mut state.subscriptions {
            if sub.active && topic_matches(&sub.topic_filter, &request.topic) {
                sub.message_count += 1;
            }
        }

        state.stats.messages_received += 1;
        state.stats.bytes_received += request.payload.len() as u64;

        if state.message_buffer.len() >= MAX_TOTAL_MESSAGES {
            state.message_buffer.pop_front();
        }
        state.message_buffer.push_back(msg);
    }

    pub fn poll_messages(&self) -> Vec<MqttMessage> {
        let mut state = self.state.lock();
        // Generate any pending messages
        Self::tick(&mut state);

        // Return messages matching any active subscription
        let active_filters: Vec<(String, MqttQoS)> = state
            .subscriptions
            .iter()
            .filter(|s| s.active)
            .map(|s| (s.topic_filter.clone(), s.qos))
            .collect();

        if active_filters.is_empty() {
            // In broker mode, return all recent messages
            return state.message_buffer.drain(..).collect();
        }

        let messages: Vec<MqttMessage> = state
            .message_buffer
            .drain(..)
            .filter(|msg| {
                active_filters
                    .iter()
                    .any(|(filter, _)| topic_matches(filter, &msg.topic))
            })
            .collect();

        messages
    }

    pub fn get_subscriptions(&self) -> Vec<MqttSubscriptionInfo> {
        let state = self.state.lock();
        state
            .subscriptions
            .iter()
            .map(|s| MqttSubscriptionInfo {
                id: s.id,
                topic_filter: s.topic_filter.clone(),
                qos: s.qos,
                message_count: s.message_count,
                active: s.active,
            })
            .collect()
    }

    pub fn get_topics(&self) -> Vec<MqttTopicInfo> {
        let mut state = self.state.lock();
        Self::tick(&mut state);

        state
            .topic_meta
            .iter()
            .map(|(topic, meta)| MqttTopicInfo {
                topic: topic.clone(),
                message_count: meta.message_count,
                last_payload_preview: meta.last_payload_preview.clone(),
                last_timestamp: meta.last_timestamp.clone(),
                subscriber_count: meta.subscriber_count,
                retained_payload: state.retained.get(topic).map(|m| m.payload.clone()),
            })
            .collect()
    }

    pub fn get_broker_stats(&self) -> BrokerStats {
        let mut state = self.state.lock();
        let uptime = Self::elapsed_secs(state.start_time) as u64;
        state.stats.uptime_secs = uptime;
        state.stats.active_connections = state.broker_clients.len() as u32;
        state.stats.total_connections = state.broker_clients.len() as u64 + 3; // some past connections
        state.stats.retained_messages = state.retained.len() as u32;
        state.stats.clone()
    }

    pub fn get_broker_clients(&self) -> Vec<BrokerClientInfo> {
        let state = self.state.lock();
        state
            .broker_clients
            .iter()
            .map(|c| BrokerClientInfo {
                client_id: c.client_id.clone(),
                connected_at: c.connected_at.clone(),
                subscriptions: c.subscriptions.clone(),
                messages_in: c.messages_in,
                messages_out: c.messages_out,
            })
            .collect()
    }
}

impl Default for MqttSimulator {
    fn default() -> Self {
        Self::new()
    }
}

// ─── Helpers ─────────────────────────────────────────────────────

/// Match an MQTT topic against a topic filter supporting `+` and `#` wildcards.
pub fn topic_matches(filter: &str, topic: &str) -> bool {
    // Exact match fast path
    if filter == topic {
        return true;
    }
    // Multi-level wildcard at end
    if filter == "#" {
        return true;
    }

    let filter_parts: Vec<&str> = filter.split('/').collect();
    let topic_parts: Vec<&str> = topic.split('/').collect();

    let mut fi = 0;
    let mut ti = 0;

    while fi < filter_parts.len() && ti < topic_parts.len() {
        match filter_parts[fi] {
            "#" => return true, // matches everything from here
            "+" => {
                // matches exactly one level
                fi += 1;
                ti += 1;
            }
            part => {
                if part != topic_parts[ti] {
                    return false;
                }
                fi += 1;
                ti += 1;
            }
        }
    }

    // All filter parts consumed and all topic parts consumed
    fi == filter_parts.len() && ti == topic_parts.len()
}

/// Detect the payload format from content.
pub fn detect_payload_format(payload: &str) -> PayloadFormat {
    let trimmed = payload.trim();
    if trimmed.is_empty() {
        return PayloadFormat::Text;
    }
    // Try JSON
    if (trimmed.starts_with('{') && trimmed.ends_with('}'))
        || (trimmed.starts_with('[') && trimmed.ends_with(']'))
    {
        if serde_json::from_str::<serde_json::Value>(trimmed).is_ok() {
            return PayloadFormat::Json;
        }
    }
    // Check if hex string
    if trimmed.len() % 2 == 0
        && trimmed.len() >= 4
        && trimmed.chars().all(|c| c.is_ascii_hexdigit())
    {
        return PayloadFormat::Hex;
    }
    PayloadFormat::Text
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_topic_matching() {
        assert!(topic_matches("factory/#", "factory/line1/temperature"));
        assert!(topic_matches(
            "factory/+/temperature",
            "factory/line1/temperature"
        ));
        assert!(!topic_matches(
            "factory/+/temperature",
            "factory/line1/line2/temperature"
        ));
        assert!(topic_matches("#", "any/topic/here"));
        assert!(topic_matches("exact/match", "exact/match"));
        assert!(!topic_matches("exact/match", "exact/other"));
        assert!(topic_matches("+/+/+", "a/b/c"));
        assert!(!topic_matches("+/+", "a/b/c"));
        assert!(topic_matches("sensors/+", "sensors/humidity"));
        assert!(!topic_matches("sensors/+", "sensors/humidity/zone1"));
    }

    #[test]
    fn test_detect_payload_format() {
        assert_eq!(
            detect_payload_format(r#"{"key":"value"}"#),
            PayloadFormat::Json
        );
        assert_eq!(detect_payload_format("[1,2,3]"), PayloadFormat::Json);
        assert_eq!(detect_payload_format("hello"), PayloadFormat::Text);
        assert_eq!(detect_payload_format("deadbeef"), PayloadFormat::Hex);
        assert_eq!(detect_payload_format("42.5"), PayloadFormat::Text);
    }
}
