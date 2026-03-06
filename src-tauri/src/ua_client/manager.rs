use std::collections::HashMap;
use std::sync::atomic::{AtomicU32, Ordering};

use super::simulator::OpcUaSimulator;
use super::types::*;
use super::real_client::RealOpcUaConnection;

/// Backend kind for a connection
enum ConnectionBackend {
    Simulator,
    Real(RealOpcUaConnection),
}

/// Manages all OPC UA client connections (both simulator and real)
pub struct UaClientManager {
    connections: tokio::sync::Mutex<HashMap<String, ConnectionState>>,
    simulator: OpcUaSimulator,
    next_sub_id: AtomicU32,
    next_item_id: AtomicU32,
}

struct ConnectionState {
    config: ConnectionConfig,
    status: ConnectionStatus,
    backend: ConnectionBackend,
    /// Subscription state (only used for simulator connections)
    subscriptions: HashMap<u32, SubscriptionState>,
}

struct SubscriptionState {
    info: CreateSubscriptionRequest,
    items: Vec<(u32, String, String)>, // (item_id, node_id, display_name)
}

impl UaClientManager {
    pub fn new() -> Self {
        Self {
            connections: tokio::sync::Mutex::new(HashMap::new()),
            simulator: OpcUaSimulator::new(),
            next_sub_id: AtomicU32::new(1),
            next_item_id: AtomicU32::new(1),
        }
    }

    /// Determine if a connection should use the simulator
    fn should_use_simulator(config: &ConnectionConfig) -> bool {
        config.use_simulator
    }

    // ─── Connection Management ───────────────────────────────────

    pub async fn connect(&self, config: ConnectionConfig) -> Result<String, String> {
        let use_sim = Self::should_use_simulator(&config);
        let id = uuid::Uuid::new_v4().to_string();

        let backend = if use_sim {
            log::info!("Connecting via simulator for: {}", config.endpoint_url);
            ConnectionBackend::Simulator
        } else {
            log::info!(
                "Connecting via real OPC UA client for: {}",
                config.endpoint_url
            );
            let conn = RealOpcUaConnection::connect(&config).await?;
            ConnectionBackend::Real(conn)
        };

        let mut conns = self.connections.lock().await;
        conns.insert(
            id.clone(),
            ConnectionState {
                config,
                status: ConnectionStatus::Connected,
                backend,
                subscriptions: HashMap::new(),
            },
        );
        Ok(id)
    }

    pub async fn disconnect(&self, connection_id: &str) -> Result<(), String> {
        let mut conns = self.connections.lock().await;
        let state = conns
            .remove(connection_id)
            .ok_or_else(|| "Connection not found".to_string())?;

        // Clean up real connections
        match state.backend {
            ConnectionBackend::Simulator => {}
            ConnectionBackend::Real(conn) => {
                let _ = conn.disconnect().await;
            }
        }

        Ok(())
    }

    pub async fn discover_endpoints(&self, url: &str) -> Result<Vec<EndpointInfo>, String> {
        // Try real discovery first
        match RealOpcUaConnection::discover_endpoints(url).await {
            Ok(endpoints) if !endpoints.is_empty() => return Ok(endpoints),
            Err(e) => {
                log::warn!("Real endpoint discovery failed, falling back to simulator: {e}");
            }
            _ => {}
        }

        // Fall back to simulator
        Ok(self.simulator.discover_endpoints(url))
    }

    pub async fn list_connections(&self) -> Vec<ConnectionInfo> {
        let conns = self.connections.lock().await;
        conns
            .iter()
            .map(|(id, state)| ConnectionInfo {
                id: id.clone(),
                name: state.config.name.clone(),
                endpoint_url: state.config.endpoint_url.clone(),
                status: state.status.clone(),
                security_policy: state.config.security_policy.clone(),
                security_mode: state.config.security_mode.clone(),
                is_simulator: matches!(state.backend, ConnectionBackend::Simulator),
            })
            .collect()
    }

    pub async fn get_status(&self, connection_id: &str) -> Result<ConnectionStatus, String> {
        let conns = self.connections.lock().await;
        conns
            .get(connection_id)
            .map(|s| s.status.clone())
            .ok_or_else(|| "Connection not found".to_string())
    }

    // ─── Browse ──────────────────────────────────────────────────

    pub async fn browse(
        &self,
        connection_id: &str,
        node_id: &str,
    ) -> Result<Vec<BrowseNode>, String> {
        let conns = self.connections.lock().await;
        let conn = conns
            .get(connection_id)
            .ok_or_else(|| "Connection not found".to_string())?;

        match &conn.backend {
            ConnectionBackend::Simulator => Ok(self.simulator.browse(node_id)),
            ConnectionBackend::Real(real) => real.browse(node_id).await,
        }
    }

    pub async fn read_node_details(
        &self,
        connection_id: &str,
        node_id: &str,
    ) -> Result<NodeDetails, String> {
        let conns = self.connections.lock().await;
        let conn = conns
            .get(connection_id)
            .ok_or_else(|| "Connection not found".to_string())?;

        match &conn.backend {
            ConnectionBackend::Simulator => Ok(self.simulator.read_node_details(node_id)),
            ConnectionBackend::Real(real) => real.read_node_details(node_id).await,
        }
    }

    // ─── Read / Write ────────────────────────────────────────────

    pub async fn read_values(
        &self,
        connection_id: &str,
        node_ids: &[String],
    ) -> Result<Vec<ReadResult>, String> {
        let conns = self.connections.lock().await;
        let conn = conns
            .get(connection_id)
            .ok_or_else(|| "Connection not found".to_string())?;

        match &conn.backend {
            ConnectionBackend::Simulator => Ok(self.simulator.read_values(node_ids)),
            ConnectionBackend::Real(real) => real.read_values(node_ids).await,
        }
    }

    pub async fn write_value(
        &self,
        connection_id: &str,
        request: &WriteRequest,
    ) -> Result<WriteResult, String> {
        let conns = self.connections.lock().await;
        let conn = conns
            .get(connection_id)
            .ok_or_else(|| "Connection not found".to_string())?;

        match &conn.backend {
            ConnectionBackend::Simulator => Ok(self.simulator.write_value(request)),
            ConnectionBackend::Real(real) => real.write_value(request).await,
        }
    }

    // ─── Subscriptions ───────────────────────────────────────────

    pub async fn create_subscription(
        &self,
        connection_id: &str,
        request: &CreateSubscriptionRequest,
    ) -> Result<CreateSubscriptionResult, String> {
        let mut conns = self.connections.lock().await;
        let conn = conns
            .get_mut(connection_id)
            .ok_or("Connection not found")?;

        match &mut conn.backend {
            ConnectionBackend::Simulator => {
                let sub_id = self.next_sub_id.fetch_add(1, Ordering::Relaxed);
                conn.subscriptions.insert(
                    sub_id,
                    SubscriptionState {
                        info: request.clone(),
                        items: Vec::new(),
                    },
                );

                Ok(CreateSubscriptionResult {
                    subscription_id: sub_id,
                    revised_publishing_interval: request.publishing_interval,
                    revised_lifetime_count: request.lifetime_count,
                    revised_max_keep_alive_count: request.max_keep_alive_count,
                })
            }
            ConnectionBackend::Real(real) => real.create_subscription(request).await,
        }
    }

    pub async fn delete_subscription(
        &self,
        connection_id: &str,
        subscription_id: u32,
    ) -> Result<(), String> {
        let mut conns = self.connections.lock().await;
        let conn = conns
            .get_mut(connection_id)
            .ok_or("Connection not found")?;

        match &mut conn.backend {
            ConnectionBackend::Simulator => {
                conn.subscriptions
                    .remove(&subscription_id)
                    .ok_or("Subscription not found")?;
                Ok(())
            }
            ConnectionBackend::Real(real) => real.delete_subscription(subscription_id).await,
        }
    }

    pub async fn add_monitored_items(
        &self,
        connection_id: &str,
        subscription_id: u32,
        items: &[MonitoredItemRequest],
    ) -> Result<Vec<u32>, String> {
        let mut conns = self.connections.lock().await;
        let conn = conns
            .get_mut(connection_id)
            .ok_or("Connection not found")?;

        match &mut conn.backend {
            ConnectionBackend::Simulator => {
                let sub = conn
                    .subscriptions
                    .get_mut(&subscription_id)
                    .ok_or("Subscription not found")?;

                let ids: Vec<u32> = items
                    .iter()
                    .map(|item| {
                        let id = self.next_item_id.fetch_add(1, Ordering::Relaxed);
                        let display = item
                            .display_name
                            .clone()
                            .unwrap_or_else(|| item.node_id.clone());
                        sub.items.push((id, item.node_id.clone(), display));
                        id
                    })
                    .collect();

                Ok(ids)
            }
            ConnectionBackend::Real(real) => {
                real.add_monitored_items(subscription_id, items).await
            }
        }
    }

    pub async fn remove_monitored_items(
        &self,
        connection_id: &str,
        subscription_id: u32,
        item_ids: &[u32],
    ) -> Result<(), String> {
        let mut conns = self.connections.lock().await;
        let conn = conns
            .get_mut(connection_id)
            .ok_or("Connection not found")?;

        match &mut conn.backend {
            ConnectionBackend::Simulator => {
                let sub = conn
                    .subscriptions
                    .get_mut(&subscription_id)
                    .ok_or("Subscription not found")?;
                sub.items.retain(|(id, _, _)| !item_ids.contains(id));
                Ok(())
            }
            ConnectionBackend::Real(real) => {
                real.remove_monitored_items(subscription_id, item_ids).await
            }
        }
    }

    pub async fn poll_subscription(
        &self,
        connection_id: &str,
        subscription_id: u32,
    ) -> Result<Vec<DataChangeEvent>, String> {
        let conns = self.connections.lock().await;
        let conn = conns
            .get(connection_id)
            .ok_or("Connection not found")?;

        match &conn.backend {
            ConnectionBackend::Simulator => {
                let sub = conn
                    .subscriptions
                    .get(&subscription_id)
                    .ok_or("Subscription not found")?;
                Ok(self.simulator.poll_values(subscription_id, &sub.items))
            }
            ConnectionBackend::Real(real) => real.poll_subscription(subscription_id),
        }
    }

    pub async fn get_subscriptions(
        &self,
        connection_id: &str,
    ) -> Result<Vec<SubscriptionInfo>, String> {
        let conns = self.connections.lock().await;
        let conn = conns
            .get(connection_id)
            .ok_or("Connection not found")?;

        match &conn.backend {
            ConnectionBackend::Simulator => Ok(conn
                .subscriptions
                .iter()
                .map(|(id, state)| SubscriptionInfo {
                    id: *id,
                    publishing_interval: state.info.publishing_interval,
                    monitored_items: state
                        .items
                        .iter()
                        .map(|(item_id, node_id, display_name)| MonitoredItemInfo {
                            id: *item_id,
                            node_id: node_id.clone(),
                            display_name: display_name.clone(),
                            sampling_interval: state.info.publishing_interval,
                        })
                        .collect(),
                })
                .collect()),
            ConnectionBackend::Real(real) => Ok(real.get_subscriptions()),
        }
    }

    // ─── Method Calls ────────────────────────────────────────────

    pub async fn call_method(
        &self,
        connection_id: &str,
        request: &CallMethodRequest,
    ) -> Result<CallMethodResult, String> {
        let conns = self.connections.lock().await;
        let conn = conns
            .get(connection_id)
            .ok_or_else(|| "Connection not found".to_string())?;

        match &conn.backend {
            ConnectionBackend::Simulator => {
                // Simulate method execution
                Ok(CallMethodResult {
                    status_code: "Good".to_string(),
                    output_arguments: vec!["Success".to_string()],
                })
            }
            ConnectionBackend::Real(real) => real.call_method(request).await,
        }
    }

    // ─── Events ──────────────────────────────────────────────────

    pub async fn poll_events(&self, connection_id: &str) -> Result<Vec<EventData>, String> {
        let conns = self.connections.lock().await;
        let conn = conns
            .get(connection_id)
            .ok_or_else(|| "Connection not found".to_string())?;

        match &conn.backend {
            ConnectionBackend::Simulator => Ok(self.simulator.generate_events()),
            ConnectionBackend::Real(_real) => {
                // Real event polling would require EventFilter subscription setup
                // For now, return empty events for real connections
                // TODO: Implement real OPC UA event subscriptions
                Ok(vec![])
            }
        }
    }
}

impl Default for UaClientManager {
    fn default() -> Self {
        Self::new()
    }
}
