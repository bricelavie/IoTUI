use std::collections::HashMap;
use std::sync::Arc;
use std::sync::atomic::{AtomicU32, Ordering};

use tokio::sync::{Mutex, RwLock};

use crate::error::{AppError, AppResult};

use super::client::OpcUaConnection;
use super::simulator::OpcUaSimulator;
use super::types::*;

enum ConnectionBackend {
    Simulator,
    Live(Arc<Mutex<OpcUaConnection>>),
}

struct ConnectionState {
    config: ConnectionConfig,
    status: ConnectionStatus,
    last_error: Option<String>,
    backend: ConnectionBackend,
    subscriptions: HashMap<u32, SubscriptionState>,
}

struct SubscriptionState {
    info: CreateSubscriptionRequest,
    items: Vec<(u32, String, String)>,
}

type SharedConnectionState = Arc<RwLock<ConnectionState>>;

pub struct UaClientManager {
    connections: RwLock<HashMap<String, SharedConnectionState>>,
    simulator: OpcUaSimulator,
    next_sub_id: AtomicU32,
    next_item_id: AtomicU32,
}

impl UaClientManager {
    pub fn new() -> Self {
        Self {
            connections: RwLock::new(HashMap::new()),
            simulator: OpcUaSimulator::new(),
            next_sub_id: AtomicU32::new(1),
            next_item_id: AtomicU32::new(1),
        }
    }

    async fn get_connection(&self, connection_id: &str) -> AppResult<SharedConnectionState> {
        self.connections
            .read()
            .await
            .get(connection_id)
            .cloned()
            .ok_or_else(|| AppError::not_found(format!("Connection '{connection_id}' not found")))
    }

    async fn live_backend(
        &self,
        connection_id: &str,
    ) -> AppResult<Option<Arc<Mutex<OpcUaConnection>>>> {
        let state = self.get_connection(connection_id).await?;
        let guard = state.read().await;
        Ok(match &guard.backend {
            ConnectionBackend::Simulator => None,
            ConnectionBackend::Live(client) => Some(client.clone()),
        })
    }

    pub async fn connect(&self, config: ConnectionConfig) -> AppResult<String> {
        let id = uuid::Uuid::new_v4().to_string();

        let backend = if config.use_simulator {
            log::info!("Connecting via simulator for: {}", config.endpoint_url);
            ConnectionBackend::Simulator
        } else {
            log::info!("Connecting via OPC UA client for: {}", config.endpoint_url);
            let conn = OpcUaConnection::connect(&config).await?;
            ConnectionBackend::Live(Arc::new(Mutex::new(conn)))
        };

        let state = Arc::new(RwLock::new(ConnectionState {
            config,
            status: ConnectionStatus::Connected,
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
            .ok_or_else(|| AppError::not_found("Connection not found"))?;

        let backend = {
            let mut guard = state.write().await;
            guard.status = ConnectionStatus::Disconnected;
            std::mem::replace(&mut guard.backend, ConnectionBackend::Simulator)
        };

        if let ConnectionBackend::Live(client) = backend {
            let client = client.lock().await;
            let _ = client.disconnect().await;
        }

        Ok(())
    }

    /// Disconnect all active connections. Called during graceful shutdown.
    pub async fn disconnect_all(&self) {
        let all_states: Vec<SharedConnectionState> = {
            let mut map = self.connections.write().await;
            map.drain().map(|(_, state)| state).collect()
        };

        for state in all_states {
            let backend = {
                let mut guard = state.write().await;
                guard.status = ConnectionStatus::Disconnected;
                std::mem::replace(&mut guard.backend, ConnectionBackend::Simulator)
            };

            if let ConnectionBackend::Live(client) = backend {
                let client = client.lock().await;
                let _ = client.disconnect().await;
            }
        }
    }

    pub async fn discover_endpoints(&self, url: &str) -> AppResult<Vec<EndpointInfo>> {
        if url.starts_with("opc.tcp://simulator") {
            return Ok(self.simulator.discover_endpoints(url));
        }
        OpcUaConnection::discover_endpoints(url).await
    }

    pub async fn list_connections(&self) -> Vec<ConnectionInfo> {
        let entries: Vec<(String, SharedConnectionState)> = self
            .connections
            .read()
            .await
            .iter()
            .map(|(id, state)| (id.clone(), state.clone()))
            .collect();

        let mut results = Vec::with_capacity(entries.len());
        for (id, state) in entries {
            let guard = state.read().await;
            results.push(ConnectionInfo {
                id,
                name: guard.config.name.clone(),
                endpoint_url: guard.config.endpoint_url.clone(),
                status: guard.status.clone(),
                security_policy: guard.config.security_policy.clone(),
                security_mode: guard.config.security_mode.clone(),
                is_simulator: matches!(guard.backend, ConnectionBackend::Simulator),
                last_error: guard.last_error.clone(),
            });
        }

        results
    }

    pub async fn get_status(&self, connection_id: &str) -> AppResult<ConnectionStatus> {
        let state = self.get_connection(connection_id).await?;
        let live_backend = self.live_backend(connection_id).await?;
        if let Some(client) = live_backend {
            let health = client.lock().await.health().await;
            let mut guard = state.write().await;
            guard.status = match health {
                super::client::LiveConnectionHealth::Connected => ConnectionStatus::Connected,
                super::client::LiveConnectionHealth::Reconnecting => ConnectionStatus::Reconnecting,
                super::client::LiveConnectionHealth::Disconnected => ConnectionStatus::Error,
            };
            if health == super::client::LiveConnectionHealth::Disconnected {
                guard.last_error.get_or_insert_with(|| "Connection is disconnected".to_string());
            } else if health == super::client::LiveConnectionHealth::Connected {
                guard.last_error = None;
            }
            return Ok(guard.status.clone());
        }

        let status = state.read().await.status.clone();
        Ok(status)
    }

    pub async fn browse(&self, connection_id: &str, node_id: &str) -> AppResult<Vec<BrowseNode>> {
        match self.live_backend(connection_id).await? {
            Some(client) => client.lock().await.browse(node_id).await,
            None => Ok(self.simulator.browse(node_id)),
        }
    }

    pub async fn read_node_details(
        &self,
        connection_id: &str,
        node_id: &str,
    ) -> AppResult<NodeDetails> {
        match self.live_backend(connection_id).await? {
            Some(client) => client.lock().await.read_node_details(node_id).await,
            None => Ok(self.simulator.read_node_details(node_id)),
        }
    }

    pub async fn read_values(
        &self,
        connection_id: &str,
        node_ids: &[String],
    ) -> AppResult<Vec<ReadResult>> {
        match self.live_backend(connection_id).await? {
            Some(client) => client.lock().await.read_values(node_ids).await,
            None => Ok(self.simulator.read_values(node_ids)),
        }
    }

    pub async fn write_value(
        &self,
        connection_id: &str,
        request: &WriteRequest,
    ) -> AppResult<WriteResult> {
        match self.live_backend(connection_id).await? {
            Some(client) => client.lock().await.write_value(request).await,
            None => Ok(self.simulator.write_value(request)),
        }
    }

    pub async fn read_history(
        &self,
        connection_id: &str,
        request: &HistoryReadRequest,
    ) -> AppResult<HistoryReadResult> {
        match self.live_backend(connection_id).await? {
            Some(client) => client.lock().await.read_history(request).await,
            None => Ok(self.simulator.read_history(request)),
        }
    }

    pub async fn create_subscription(
        &self,
        connection_id: &str,
        request: &CreateSubscriptionRequest,
    ) -> AppResult<CreateSubscriptionResult> {
        let state = self.get_connection(connection_id).await?;
        let mut guard = state.write().await;

        match &mut guard.backend {
            ConnectionBackend::Simulator => {
                let sub_id = self.next_sub_id.fetch_add(1, Ordering::Relaxed);
                guard.subscriptions.insert(
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
            ConnectionBackend::Live(client) => client.lock().await.create_subscription(request).await,
        }
    }

    pub async fn delete_subscription(
        &self,
        connection_id: &str,
        subscription_id: u32,
    ) -> AppResult<()> {
        let state = self.get_connection(connection_id).await?;
        let mut guard = state.write().await;

        match &mut guard.backend {
            ConnectionBackend::Simulator => {
                guard
                    .subscriptions
                    .remove(&subscription_id)
                    .ok_or_else(|| AppError::not_found("Subscription not found"))?;
                Ok(())
            }
            ConnectionBackend::Live(client) => client.lock().await.delete_subscription(subscription_id).await,
        }
    }

    pub async fn add_monitored_items(
        &self,
        connection_id: &str,
        subscription_id: u32,
        items: &[MonitoredItemRequest],
    ) -> AppResult<Vec<u32>> {
        let state = self.get_connection(connection_id).await?;
        let mut guard = state.write().await;

        match &mut guard.backend {
            ConnectionBackend::Simulator => {
                let sub = guard
                    .subscriptions
                    .get_mut(&subscription_id)
                    .ok_or_else(|| AppError::not_found("Subscription not found"))?;

                let ids = items
                    .iter()
                    .map(|item| {
                        let id = self.next_item_id.fetch_add(1, Ordering::Relaxed);
                        let display_name = item
                            .display_name
                            .clone()
                            .unwrap_or_else(|| item.node_id.clone());
                        sub.items.push((id, item.node_id.clone(), display_name));
                        id
                    })
                    .collect();

                Ok(ids)
            }
            ConnectionBackend::Live(client) => client.lock().await.add_monitored_items(subscription_id, items).await,
        }
    }

    pub async fn remove_monitored_items(
        &self,
        connection_id: &str,
        subscription_id: u32,
        item_ids: &[u32],
    ) -> AppResult<()> {
        let state = self.get_connection(connection_id).await?;
        let mut guard = state.write().await;

        match &mut guard.backend {
            ConnectionBackend::Simulator => {
                let sub = guard
                    .subscriptions
                    .get_mut(&subscription_id)
                    .ok_or_else(|| AppError::not_found("Subscription not found"))?;
                sub.items.retain(|(id, _, _)| !item_ids.contains(id));
                Ok(())
            }
            ConnectionBackend::Live(client) => client.lock().await.remove_monitored_items(subscription_id, item_ids).await,
        }
    }

    pub async fn poll_subscription(
        &self,
        connection_id: &str,
        subscription_id: u32,
    ) -> AppResult<Vec<DataChangeEvent>> {
        match self.live_backend(connection_id).await? {
            Some(client) => client.lock().await.poll_subscription(subscription_id),
            None => {
                let state = self.get_connection(connection_id).await?;
                let guard = state.read().await;
                let sub = guard
                    .subscriptions
                    .get(&subscription_id)
                    .ok_or_else(|| AppError::not_found("Subscription not found"))?;
                Ok(self.simulator.poll_values(subscription_id, &sub.items))
            }
        }
    }

    pub async fn get_subscriptions(&self, connection_id: &str) -> AppResult<Vec<SubscriptionInfo>> {
        match self.live_backend(connection_id).await? {
            Some(client) => {
                let mut client = client.lock().await;
                client.sync_subscription_bindings();
                Ok(client.get_subscriptions())
            }
            None => {
                let state = self.get_connection(connection_id).await?;
                let guard = state.read().await;
                Ok(guard
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
                    .collect())
            }
        }
    }

    pub async fn get_method_info(
        &self,
        connection_id: &str,
        method_node_id: &str,
    ) -> AppResult<MethodInfo> {
        match self.live_backend(connection_id).await? {
            Some(client) => client.lock().await.get_method_info(method_node_id).await,
            None => self
                .simulator
                .get_method_info(method_node_id)
                .map_err(AppError::opcua),
        }
    }

    pub async fn call_method(
        &self,
        connection_id: &str,
        request: &CallMethodRequest,
    ) -> AppResult<CallMethodResult> {
        match self.live_backend(connection_id).await? {
            Some(client) => client.lock().await.call_method(request).await,
            None => self.simulator.call_method(request).map_err(AppError::opcua),
        }
    }

    pub async fn poll_events(&self, connection_id: &str) -> AppResult<Vec<EventData>> {
        match self.live_backend(connection_id).await? {
            Some(client) => Ok(client.lock().await.poll_events()),
            None => Ok(self.simulator.generate_events()),
        }
    }
}

impl Default for UaClientManager {
    fn default() -> Self {
        Self::new()
    }
}
