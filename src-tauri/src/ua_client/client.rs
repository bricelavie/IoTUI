//! OPC UA client implementation using the async-opcua crate.

use std::collections::{HashMap, VecDeque};
use std::str::FromStr;
use std::sync::Arc;
use std::sync::atomic::{AtomicBool, Ordering};
use std::time::Duration;

use futures_util::StreamExt;
use log::{debug, info};
use parking_lot::Mutex as SyncMutex;

use opcua::client::{
    ClientBuilder, DataChangeCallback, EventCallback, IdentityToken, Session, SessionPollResult,
};
use opcua::crypto::SecurityPolicy;
use opcua::types::argument::Argument;
use opcua::types::{
    AttributeId, BrowseDescription, BrowseDirection, BrowseResultMask, ContentFilter, DataValue,
    EventFilter, ExtensionObject, Guid, HistoryData, HistoryReadValueId, MessageSecurityMode,
    MonitoredItemCreateRequest as OpcMonitoredItemCreateRequest, MonitoringMode,
    MonitoringParameters, NodeClassMask, NodeId, NumericRange, ObjectId, ObjectTypeId,
    QualifiedName, ReadRawModifiedDetails, ReadValueId, ReferenceTypeId, SimpleAttributeOperand,
    StatusCode, TimestampsToReturn, Variant, WriteValue,
};

use crate::error::{AppError, AppResult};

use super::types::*;

const MAX_BUFFERED_EVENTS: usize = 5_000;

#[derive(Debug, Clone)]
struct MonitoredItemState {
    logical_item_id: u32,
    client_handle: u32,
    node_id: String,
    display_name: String,
    sampling_interval: f64,
}

#[derive(Debug, Clone)]
struct SubscriptionBinding {
    logical_subscription_id: u32,
}

fn push_bounded<T>(buffer: &mut VecDeque<T>, value: T) {
    if buffer.len() >= MAX_BUFFERED_EVENTS {
        buffer.pop_front();
    }
    buffer.push_back(value);
}

fn parse_connection_health(event: &SessionPollResult) -> Option<LiveConnectionHealth> {
    match event {
        SessionPollResult::BeginConnect | SessionPollResult::ReconnectFailed(_) => {
            Some(LiveConnectionHealth::Reconnecting)
        }
        SessionPollResult::Reconnected(_) => Some(LiveConnectionHealth::Connected),
        SessionPollResult::ConnectionLost(_) | SessionPollResult::FinishedDisconnect => {
            Some(LiveConnectionHealth::Disconnected)
        }
        _ => None,
    }
}

/// Holds state for a single OPC UA connection
pub struct OpcUaConnection {
    session: Arc<Session>,
    event_loop_handle: tokio::task::JoinHandle<StatusCode>,
    /// Subscription data change buffers: subscription_id -> VecDeque<DataChangeEvent>
    /// Filled by callbacks, drained by poll_subscription
    data_buffers: Arc<SyncMutex<HashMap<u32, VecDeque<DataChangeEvent>>>>,
    /// Mapping of subscription_id -> Vec<(monitored_item_id, client_handle, node_id, display_name)>
    monitored_items: HashMap<u32, Vec<MonitoredItemState>>,
    /// Mapping of subscription_id -> publishing_interval (f64 ms)
    subscription_intervals: HashMap<u32, f64>,
    /// Event buffer: bounded ring buffer filled by EventCallback, drained by poll_events
    event_buffer: Arc<SyncMutex<VecDeque<EventData>>>,
    /// Server-side subscription ID used for the auto-subscribed event subscription, if any.
    event_subscription_id: Option<u32>,
    /// Indicates whether a connection is currently usable.
    connected: Arc<AtomicBool>,
    reconnecting: Arc<AtomicBool>,
    subscription_bindings: Arc<SyncMutex<HashMap<u32, SubscriptionBinding>>>,
    next_logical_subscription_id: u32,
    next_logical_item_id: u32,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum LiveConnectionHealth {
    Connected,
    Reconnecting,
    Disconnected,
}

impl OpcUaConnection {
    /// Look up the server-assigned subscription ID for a given logical subscription ID.
    fn resolve_server_subscription_id(
        subscription_bindings: &SyncMutex<HashMap<u32, SubscriptionBinding>>,
        logical_subscription_id: u32,
    ) -> u32 {
        subscription_bindings
            .lock()
            .iter()
            .find_map(|(server_id, binding)| {
                if binding.logical_subscription_id == logical_subscription_id {
                    Some(*server_id)
                } else {
                    None
                }
            })
            .unwrap_or(logical_subscription_id)
    }

    fn build_data_change_callback(
        data_buffers: Arc<SyncMutex<HashMap<u32, VecDeque<DataChangeEvent>>>>,
        _subscription_bindings: Arc<SyncMutex<HashMap<u32, SubscriptionBinding>>>,
        logical_subscription_id: u32,
    ) -> DataChangeCallback {
        DataChangeCallback::new(move |dv, item| {
            let node_id_str = item.item_to_monitor().node_id.to_string();
            let display_name = node_id_str.clone();
            let value_str = dv
                .value
                .as_ref()
                .map(variant_to_string)
                .unwrap_or_else(|| "null".to_string());
            let data_type = dv
                .value
                .as_ref()
                .map(variant_type_name)
                .unwrap_or_else(|| "Unknown".to_string());
            let status = dv
                .status
                .as_ref()
                .map(|s| format!("{s}"))
                .unwrap_or_else(|| "Good".to_string());

            let event = DataChangeEvent {
                subscription_id: logical_subscription_id,
                monitored_item_id: item.client_handle(),
                node_id: node_id_str,
                display_name,
                value: value_str,
                data_type,
                status_code: status,
                source_timestamp: dv.source_timestamp.as_ref().map(|ts| ts.to_string()),
                server_timestamp: dv.server_timestamp.as_ref().map(|ts| ts.to_string()),
            };

            let mut bufs = data_buffers.lock();
            let buffer = bufs.entry(logical_subscription_id).or_insert_with(VecDeque::new);
            push_bounded(buffer, event);
        })
    }

    fn sync_rebound_subscriptions(&mut self) {
        let state = self.session.subscription_state().lock();
        let existing_ids = state.subscription_ids().unwrap_or_default();
        if existing_ids.is_empty() {
            return;
        }

        // Build a map of server_id -> (publishing_interval, set of client_handles)
        let mut server_info: HashMap<u32, (f64, Vec<u32>)> = HashMap::new();
        for server_id in existing_ids {
            if let Some(sub) = state.get(server_id) {
                let handles: Vec<u32> = sub.monitored_items().map(|mi| mi.client_handle()).collect();
                server_info.insert(server_id, (sub.publishing_interval().as_millis() as f64, handles));
            }
        }

        let mut next_bindings = HashMap::new();
        for (logical_id, _interval) in self.subscription_intervals.iter() {
            // 1. Try existing preferred binding (still alive on server)
            let preferred = Self::resolve_server_subscription_id(&self.subscription_bindings, *logical_id);
            let preferred = if server_info.contains_key(&preferred) {
                Some(preferred)
            } else {
                None
            };

            // 2. Fall back: match by monitored item client_handles (robust after reconnect)
            let chosen = preferred.or_else(|| {
                let our_handles: Vec<u32> = self
                    .monitored_items
                    .get(logical_id)
                    .map(|items| items.iter().map(|i| i.client_handle).collect())
                    .unwrap_or_default();
                if our_handles.is_empty() {
                    return None;
                }
                server_info
                    .iter()
                    .find_map(|(server_id, (_interval, server_handles))| {
                        if !next_bindings.contains_key(server_id)
                            && our_handles.iter().all(|h| server_handles.contains(h))
                        {
                            Some(*server_id)
                        } else {
                            None
                        }
                    })
            });

            if let Some(server_id) = chosen {
                next_bindings.insert(
                    server_id,
                    SubscriptionBinding {
                        logical_subscription_id: *logical_id,
                    },
                );
            }
        }

        *self.subscription_bindings.lock() = next_bindings;
    }

    fn parse_security_policy(policy: &str) -> AppResult<SecurityPolicy> {
        SecurityPolicy::from_str(policy).map_err(|_| {
            AppError::security(format!(
                "Unsupported security policy '{policy}'. Discover endpoints and select a supported policy."
            ))
        })
    }

    fn parse_security_mode(mode: &str) -> AppResult<MessageSecurityMode> {
        match mode {
            "None" => Ok(MessageSecurityMode::None),
            "Sign" => Ok(MessageSecurityMode::Sign),
            "SignAndEncrypt" => Ok(MessageSecurityMode::SignAndEncrypt),
            _ => Err(AppError::security(format!(
                "Unsupported security mode '{mode}'."
            ))),
        }
    }

    fn validate_security_combo(
        security_policy: SecurityPolicy,
        message_security_mode: MessageSecurityMode,
    ) -> AppResult<()> {
        if security_policy == SecurityPolicy::None
            && message_security_mode != MessageSecurityMode::None
        {
            return Err(AppError::security(
                "Security policy 'None' requires security mode 'None'.",
            ));
        }

        if security_policy != SecurityPolicy::None
            && message_security_mode == MessageSecurityMode::None
        {
            return Err(AppError::security(
                "A secure policy requires message security mode 'Sign' or 'SignAndEncrypt'.",
            ));
        }

        Ok(())
    }

    fn session_timeout(config: &ConnectionConfig) -> u32 {
        config.session_timeout.unwrap_or(60_000).clamp(10_000, 300_000)
    }

    /// Connect to an OPC UA server
    pub async fn connect(config: &ConnectionConfig) -> AppResult<Self> {
        info!("Connecting to OPC UA server: {}", config.endpoint_url);

        let security_policy = Self::parse_security_policy(&config.security_policy)?;
        let message_security_mode = Self::parse_security_mode(&config.security_mode)?;
        Self::validate_security_combo(security_policy, message_security_mode)?;

        let mut client = ClientBuilder::new()
            .application_name("IoTUI")
            .application_uri("urn:iotui:client")
            .product_uri("urn:iotui")
            .trust_server_certs(config.trust_server_certs)
            .create_sample_keypair(true)
            .session_retry_limit(3)
            .recreate_subscriptions(true)
            .session_timeout(Self::session_timeout(config))
            .client()
            .map_err(|errs| AppError::connection(format!("Failed to create OPC UA client: {}", errs.join(", "))))?;

        // Determine identity token
        let identity = match config.auth_type {
            AuthType::Anonymous => IdentityToken::Anonymous,
            AuthType::UsernamePassword => {
                let user = config.username.clone().unwrap_or_default();
                let pass = config.password.clone().unwrap_or_default();
                if user.trim().is_empty() {
                    return Err(AppError::invalid_argument(
                        "Username/password authentication requires a username.",
                    ));
                }
                IdentityToken::new_user_name(user, pass)
            }
            AuthType::Certificate => {
                let cert_path = config.certificate_path.as_deref().unwrap_or_default();
                let key_path = config.private_key_path.as_deref().unwrap_or_default();
                if cert_path.is_empty() || key_path.is_empty() {
                    return Err(AppError::invalid_argument(
                        "Certificate authentication requires both a certificate path and a private key path.",
                    ));
                }
                let cert_path_ref = std::path::Path::new(cert_path);
                let key_path_ref = std::path::Path::new(key_path);
                if !cert_path_ref.exists() {
                    return Err(AppError::invalid_argument(format!(
                        "Certificate file not found: {}",
                        cert_path
                    )));
                }
                if !key_path_ref.exists() {
                    return Err(AppError::invalid_argument(format!(
                        "Private key file not found: {}",
                        key_path
                    )));
                }
                IdentityToken::new_x509_path(cert_path_ref, key_path_ref)
                    .map_err(|e| AppError::security(format!("Failed to load certificate/key: {e}")))?
            }
        };

        let (session, event_loop) = client
            .connect_to_matching_endpoint(
                (
                    config.endpoint_url.as_str(),
                    security_policy.to_str(),
                    message_security_mode,
                ),
                identity,
            )
            .await
            .map_err(|e| AppError::connection(format!("Failed to connect: {e}")))?;

        let connected_flag = Arc::new(AtomicBool::new(false));
        let reconnecting_flag = Arc::new(AtomicBool::new(false));
        let subscription_bindings = Arc::new(SyncMutex::new(HashMap::new()));
        let connected_for_loop = connected_flag.clone();
        let reconnecting_for_loop = reconnecting_flag.clone();
        let data_buffers_runtime = Arc::new(SyncMutex::new(HashMap::new()));
        let event_loop_handle = tokio::spawn(async move {
            let stream = event_loop.enter();
            tokio::pin!(stream);
            let mut final_status = StatusCode::Good;

            while let Some(result) = stream.next().await {
                match result {
                    Ok(event) => {
                        debug!("Session event: {:?}", event);
                        if let Some(health) = parse_connection_health(&event) {
                            reconnecting_for_loop.store(
                                matches!(health, LiveConnectionHealth::Reconnecting),
                                Ordering::Relaxed,
                            );
                            connected_for_loop.store(
                                matches!(health, LiveConnectionHealth::Connected),
                                Ordering::Relaxed,
                            );
                        }
                    }
                    Err(code) => {
                        connected_for_loop.store(false, Ordering::Relaxed);
                        reconnecting_for_loop.store(false, Ordering::Relaxed);
                        final_status = code;
                        break;
                    }
                }
            }

            final_status
        });

        // Wait for connection with timeout
        let wait_session = session.clone();
        let connected = tokio::time::timeout(Duration::from_secs(10), async move {
            wait_session.wait_for_connection().await;
        })
        .await;

        if connected.is_err() {
            event_loop_handle.abort();
            return Err(AppError::connection("Connection timed out after 10 seconds"));
        }
        connected_flag.store(true, Ordering::Relaxed);

        info!(
            "Successfully connected to OPC UA server: {}",
            config.endpoint_url
        );

        let mut conn = Self {
            session,
            event_loop_handle,
            data_buffers: data_buffers_runtime,
            monitored_items: HashMap::new(),
            subscription_intervals: HashMap::new(),
            event_buffer: Arc::new(SyncMutex::new(VecDeque::new())),
            event_subscription_id: None,
            connected: connected_flag,
            reconnecting: reconnecting_flag,
            subscription_bindings,
            next_logical_subscription_id: 1,
            next_logical_item_id: 1,
        };

        // Auto-subscribe to events (best-effort; don't fail the connection if this fails)
        match conn.subscribe_to_events().await {
            Ok(id) => {
                info!("Auto-subscribed to server events (sub_id={})", id);
                conn.event_subscription_id = Some(id);
            }
            Err(e) => log::warn!("Failed to auto-subscribe to events (server may not support events): {e}"),
        }

        Ok(conn)
    }

    /// Disconnect from the server
    pub async fn disconnect(&self) -> AppResult<()> {
        info!("Disconnecting from OPC UA server");
        // Best-effort cleanup of event subscription
        if let Some(sub_id) = self.event_subscription_id {
            if let Err(e) = self.session.delete_subscription(sub_id).await {
                debug!("Failed to delete event subscription {sub_id} during disconnect: {e}");
            }
        }
        self.session
            .disconnect()
            .await
            .map_err(|e| AppError::connection(format!("Disconnect failed: {e}")))?;
        self.connected.store(false, Ordering::Relaxed);
        self.reconnecting.store(false, Ordering::Relaxed);
        self.event_loop_handle.abort();
        Ok(())
    }

    /// Discover endpoints from a URL
    pub async fn discover_endpoints(url: &str) -> AppResult<Vec<EndpointInfo>> {
        info!("Discovering endpoints at: {}", url);

        let client = ClientBuilder::new()
            .application_name("IoTUI Discovery")
            .application_uri("urn:iotui:discovery")
            .trust_server_certs(false)
            .create_sample_keypair(true)
            .client()
            .map_err(|errs| AppError::connection(format!("Failed to create discovery client: {}", errs.join(", "))))?;

        let endpoints = client
            .get_server_endpoints_from_url(url)
            .await
            .map_err(|e| AppError::connection(format!("Failed to discover endpoints: {e}")))?;

        Ok(endpoints
            .iter()
            .map(|ep| {
                let security_policy = SecurityPolicy::from_str(ep.security_policy_uri.as_ref())
                    .map(|policy| policy.to_str().to_string())
                    .unwrap_or_else(|_| ep.security_policy_uri.as_ref().to_string());

                let security_mode = match ep.security_mode {
                    MessageSecurityMode::None => "None".to_string(),
                    MessageSecurityMode::Sign => "Sign".to_string(),
                    MessageSecurityMode::SignAndEncrypt => "SignAndEncrypt".to_string(),
                    _ => "Invalid".to_string(),
                };

                let tokens = ep
                    .user_identity_tokens
                    .as_ref()
                    .map(|tokens| {
                        tokens
                            .iter()
                            .map(|t| UserTokenInfo {
                                policy_id: t.policy_id.to_string(),
                                token_type: format!("{:?}", t.token_type),
                            })
                            .collect()
                    })
                    .unwrap_or_default();

                EndpointInfo {
                    url: ep.endpoint_url.to_string(),
                    security_policy,
                    security_mode,
                    user_identity_tokens: tokens,
                }
            })
            .collect())
    }

    /// Browse child nodes of a given node.
    ///
    /// When the server returns a continuation point (indicating more results
    /// are available), this method automatically calls `browse_next` in a
    /// loop until all references have been collected, then releases any
    /// outstanding continuation point.
    pub async fn browse(&self, node_id_str: &str) -> AppResult<Vec<BrowseNode>> {
        let node_id =
            NodeId::from_str(node_id_str).map_err(|e| AppError::invalid_argument(format!("Invalid node ID: {e}")))?;

        let browse_desc = BrowseDescription {
            node_id,
            browse_direction: BrowseDirection::Forward,
            reference_type_id: ReferenceTypeId::HierarchicalReferences.into(),
            include_subtypes: true,
            node_class_mask: NodeClassMask::all().bits(),
            result_mask: BrowseResultMask::All as u32,
        };

        let results = self
            .session
            .browse(&[browse_desc], 0, None)
            .await
            .map_err(|e| AppError::opcua(format!("Browse failed: {e}")))?;

        if results.is_empty() {
            return Ok(vec![]);
        }

        let result = &results[0];

        let mut all_references: Vec<BrowseNode> = Self::collect_browse_references(result);

        // Follow continuation points to retrieve all results
        let mut continuation_point = result.continuation_point.clone();
        const MAX_BROWSE_NEXT_LOOPS: usize = 100; // safety limit
        let mut loop_count = 0;

        while !continuation_point.is_null() && loop_count < MAX_BROWSE_NEXT_LOOPS {
            loop_count += 1;
            debug!(
                "BrowseNext: following continuation point (iteration {})",
                loop_count
            );

            let next_results = self
                .session
                .browse_next(false, &[continuation_point.clone()])
                .await
                .map_err(|e| AppError::opcua(format!("BrowseNext failed: {e}")))?;

            if next_results.is_empty() {
                break;
            }

            let next_result = &next_results[0];
            all_references.extend(Self::collect_browse_references(next_result));
            continuation_point = next_result.continuation_point.clone();
        }

        // Release any outstanding continuation point
        if !continuation_point.is_null() {
            let _ = self
                .session
                .browse_next(true, &[continuation_point])
                .await;
        }

        Ok(all_references)
    }

    /// Extract `BrowseNode`s from a single `BrowseResult`.
    fn collect_browse_references(result: &opcua::types::BrowseResult) -> Vec<BrowseNode> {
        result
            .references
            .as_ref()
            .map(|refs| {
                refs.iter()
                    .map(|r| {
                        let node_class = format!("{:?}", r.node_class);
                        // A node has children if it's an Object or a View
                        let has_children = matches!(
                            r.node_class,
                            opcua::types::NodeClass::Object
                                | opcua::types::NodeClass::View
                        );

                        BrowseNode {
                            node_id: r.node_id.node_id.to_string(),
                            browse_name: r.browse_name.to_string(),
                            display_name: r.display_name.to_string(),
                            node_class,
                            has_children,
                            type_definition: if r.type_definition.node_id.is_null() {
                                None
                            } else {
                                Some(r.type_definition.node_id.to_string())
                            },
                        }
                    })
                    .collect()
            })
            .unwrap_or_default()
    }

    /// Read detailed attributes of a node
    pub async fn read_node_details(&self, node_id_str: &str) -> AppResult<NodeDetails> {
        let node_id =
            NodeId::from_str(node_id_str).map_err(|e| AppError::invalid_argument(format!("Invalid node ID: {e}")))?;

        // Read multiple attributes at once
        let attributes_to_read = vec![
            AttributeId::NodeId,
            AttributeId::NodeClass,
            AttributeId::BrowseName,
            AttributeId::DisplayName,
            AttributeId::Description,
            AttributeId::Value,
            AttributeId::DataType,
            AttributeId::AccessLevel,
            AttributeId::UserAccessLevel,
            AttributeId::MinimumSamplingInterval,
            AttributeId::Historizing,
            AttributeId::ValueRank,
        ];

        let read_value_ids: Vec<ReadValueId> = attributes_to_read
            .iter()
            .map(|attr| ReadValueId {
                node_id: node_id.clone(),
                attribute_id: *attr as u32,
                ..Default::default()
            })
            .collect();

        let results = self
            .session
            .read(&read_value_ids, TimestampsToReturn::Both, 0.0)
            .await
            .map_err(|e| AppError::opcua(format!("Read failed: {e}")))?;

        // Parse results
        let get_val = |idx: usize| -> Option<&DataValue> { results.get(idx) };

        let node_class_str = get_val(1)
            .and_then(|dv| dv.value.as_ref())
            .map(|v| match v {
                Variant::Int32(n) => node_class_to_string(*n),
                _ => variant_to_string(v),
            })
            .unwrap_or_else(|| "Unknown".to_string());

        let browse_name = get_val(2)
            .and_then(|dv| dv.value.as_ref())
            .map(variant_to_string)
            .unwrap_or_default();

        let display_name = get_val(3)
            .and_then(|dv| dv.value.as_ref())
            .map(variant_to_string)
            .unwrap_or_default();

        let description = get_val(4)
            .and_then(|dv| dv.value.as_ref())
            .map(variant_to_string)
            .unwrap_or_default();

        let value = get_val(5).and_then(|dv| dv.value.as_ref()).map(variant_to_string);

        let data_type = get_val(6)
            .and_then(|dv| dv.value.as_ref())
            .map(|v| match v {
                Variant::NodeId(id) => data_type_node_id_to_string(id),
                _ => variant_to_string(v),
            });

        let status_code = get_val(5)
            .and_then(|dv| dv.status.as_ref())
            .map(|s| format!("{s}"))
            .unwrap_or_else(|| "Good".to_string());

        let server_timestamp = get_val(5)
            .and_then(|dv| dv.server_timestamp.as_ref())
            .map(|ts| ts.to_string());

        let source_timestamp = get_val(5)
            .and_then(|dv| dv.source_timestamp.as_ref())
            .map(|ts| ts.to_string());

        let access_level = get_val(7)
            .and_then(|dv| dv.value.as_ref())
            .and_then(|v| match v {
                Variant::Byte(b) => Some(*b),
                _ => None,
            });

        let user_access_level = get_val(8)
            .and_then(|dv| dv.value.as_ref())
            .and_then(|v| match v {
                Variant::Byte(b) => Some(*b),
                _ => None,
            });

        let minimum_sampling_interval = get_val(9)
            .and_then(|dv| dv.value.as_ref())
            .and_then(|v| match v {
                Variant::Double(d) => Some(*d),
                _ => None,
            });

        let historizing = get_val(10)
            .and_then(|dv| dv.value.as_ref())
            .and_then(|v| match v {
                Variant::Boolean(b) => Some(*b),
                _ => None,
            });

        let value_rank = get_val(11)
            .and_then(|dv| dv.value.as_ref())
            .and_then(|v| match v {
                Variant::Int32(i) => Some(*i),
                _ => None,
            });

        // Build attributes list
        let mut attributes = Vec::new();
        for (idx, attr_id) in attributes_to_read.iter().enumerate() {
            if let Some(dv) = get_val(idx) {
                let attr_name = format!("{attr_id:?}");
                let attr_value = dv
                    .value
                    .as_ref()
                    .map(variant_to_string)
                    .unwrap_or_else(|| "null".to_string());
                let attr_status = dv
                    .status
                    .as_ref()
                    .map(|s| format!("{s}"))
                    .unwrap_or_else(|| "Good".to_string());

                attributes.push(NodeAttribute {
                    name: attr_name,
                    value: attr_value,
                    data_type: dv.value.as_ref().map(variant_type_name),
                    status: attr_status,
                });
            }
        }

        // Browse for references
        let references = self.get_references(node_id_str).await.unwrap_or_default();

        Ok(NodeDetails {
            node_id: node_id_str.to_string(),
            browse_name,
            display_name,
            description,
            node_class: node_class_str,
            data_type,
            value,
            status_code,
            server_timestamp,
            source_timestamp,
            access_level,
            user_access_level,
            minimum_sampling_interval,
            historizing,
            value_rank,
            attributes,
            references,
        })
    }

    /// Get references for a node (used by read_node_details)
    async fn get_references(&self, node_id_str: &str) -> AppResult<Vec<ReferenceInfo>> {
        let node_id =
            NodeId::from_str(node_id_str).map_err(|e| AppError::invalid_argument(format!("Invalid node ID: {e}")))?;

        let browse_desc = BrowseDescription {
            node_id,
            browse_direction: BrowseDirection::Both,
            reference_type_id: ReferenceTypeId::References.into(),
            include_subtypes: true,
            node_class_mask: NodeClassMask::all().bits(),
            result_mask: BrowseResultMask::All as u32,
        };

        let results = self
            .session
            .browse(&[browse_desc], 0, None)
            .await
            .map_err(|e| AppError::opcua(format!("Browse references failed: {e}")))?;

        if results.is_empty() {
            return Ok(vec![]);
        }

        let result = &results[0];

        Ok(result
            .references
            .as_ref()
            .map(|refs| {
                refs.iter()
                    .map(|r| ReferenceInfo {
                        reference_type: r.reference_type_id.to_string(),
                        is_forward: r.is_forward,
                        target_node_id: r.node_id.node_id.to_string(),
                        target_browse_name: r.browse_name.to_string(),
                        target_display_name: r.display_name.to_string(),
                        target_node_class: format!("{:?}", r.node_class),
                    })
                    .collect()
            })
            .unwrap_or_default())
    }

    /// Read values of multiple nodes
    pub async fn read_values(&self, node_ids: &[String]) -> AppResult<Vec<ReadResult>> {
        let mut parsed = Vec::with_capacity(node_ids.len());
        for id in node_ids {
            let node_id = NodeId::from_str(id)
                .map_err(|e| AppError::invalid_argument(format!("Invalid node ID '{id}': {e}")))?;
            parsed.push((id.clone(), ReadValueId {
                node_id,
                attribute_id: AttributeId::Value as u32,
                ..Default::default()
            }));
        }

        if parsed.is_empty() {
            return Ok(vec![]);
        }

        let request: Vec<ReadValueId> = parsed.iter().map(|(_, read)| read.clone()).collect();
        let results = self
            .session
            .read(&request, TimestampsToReturn::Both, 0.0)
            .await
            .map_err(|e| AppError::opcua(format!("Read failed: {e}")))?;

        Ok(results
            .into_iter()
            .zip(parsed.into_iter())
            .map(|(dv, (node_id, _))| ReadResult {
                node_id,
                value: dv.value.as_ref().map(variant_to_string),
                data_type: dv.value.as_ref().map(variant_type_name),
                status_code: dv
                    .status
                    .as_ref()
                    .map(|s| format!("{s}"))
                    .unwrap_or_else(|| "Good".to_string()),
                server_timestamp: dv.server_timestamp.as_ref().map(|ts| ts.to_string()),
                source_timestamp: dv.source_timestamp.as_ref().map(|ts| ts.to_string()),
            })
            .collect())
    }

    /// Write a value to a node
    pub async fn write_value(&self, request: &WriteRequest) -> AppResult<WriteResult> {
        let node_id =
            NodeId::from_str(&request.node_id).map_err(|e| AppError::invalid_argument(format!("Invalid node ID: {e}")))?;

        let variant = string_to_variant(&request.value, &request.data_type)?;
        let write_value = WriteValue {
            node_id: node_id.clone(),
            attribute_id: AttributeId::Value as u32,
            index_range: opcua::types::NumericRange::None,
            value: DataValue::new_now(variant),
        };

        let results = self
            .session
            .write(&[write_value])
            .await
            .map_err(|e| AppError::opcua(format!("Write failed: {e}")))?;

        let status = results
            .first()
            .copied()
            .unwrap_or(StatusCode::BadUnexpectedError);

        Ok(WriteResult {
            node_id: request.node_id.clone(),
            status_code: format!("{status}"),
            success: status.is_good(),
        })
    }

    pub async fn read_history(&self, request: &HistoryReadRequest) -> AppResult<HistoryReadResult> {
        let node_id = NodeId::from_str(&request.node_id)
            .map_err(|e| AppError::invalid_argument(format!("Invalid node ID: {e}")))?;

        let start_time = request
            .start_time
            .as_deref()
            .map(parse_history_time)
            .transpose()?;
        let end_time = request
            .end_time
            .as_deref()
            .map(parse_history_time)
            .transpose()?;

        let details = ReadRawModifiedDetails {
            is_read_modified: false,
            start_time: start_time.unwrap_or_default(),
            end_time: end_time.unwrap_or_default(),
            num_values_per_node: request.max_values.unwrap_or(200).clamp(1, 10_000),
            return_bounds: true,
        };

        let continuation_point = request
            .continuation_point
            .as_deref()
            .map(|hex| {
                (0..hex.len())
                    .step_by(2)
                    .map(|i| u8::from_str_radix(hex.get(i..i + 2).unwrap_or(""), 16))
                    .collect::<Result<Vec<u8>, _>>()
            })
            .transpose()
            .map_err(|_| AppError::invalid_argument("Invalid continuation point hex string"))?
            .map(opcua::types::ByteString::from)
            .unwrap_or_default();

        let nodes_to_read = [HistoryReadValueId {
            node_id,
            index_range: NumericRange::None,
            data_encoding: QualifiedName::null(),
            continuation_point,
        }];

        let result = self
            .session
            .history_read(
                opcua::client::HistoryReadAction::ReadRawModifiedDetails(details),
                TimestampsToReturn::Both,
                false,
                &nodes_to_read,
            )
            .await
            .map_err(|e| AppError::opcua(format!("HistoryRead failed: {e}")))?;

        let first = result
            .first()
            .ok_or_else(|| AppError::opcua("HistoryRead returned no results"))?;

        let values = first
            .history_data
            .inner_as::<HistoryData>()
            .and_then(|history| history.data_values.clone())
            .unwrap_or_default()
            .into_iter()
            .map(|dv| HistoryValue {
                value: dv.value.as_ref().map(variant_to_string),
                data_type: dv.value.as_ref().map(variant_type_name),
                status_code: dv
                    .status
                    .as_ref()
                    .map(|s| format!("{s}"))
                    .unwrap_or_else(|| "Good".to_string()),
                source_timestamp: dv.source_timestamp.as_ref().map(|ts| ts.to_string()),
                server_timestamp: dv.server_timestamp.as_ref().map(|ts| ts.to_string()),
            })
            .collect();

        Ok(HistoryReadResult {
            node_id: request.node_id.clone(),
            values,
            continuation_point: continuation_point_to_string(&first.continuation_point),
        })
    }

    /// Create a subscription on the server
    pub async fn create_subscription(
        &mut self,
        request: &CreateSubscriptionRequest,
    ) -> AppResult<CreateSubscriptionResult> {
        let logical_subscription_id = self.next_logical_subscription_id;
        self.next_logical_subscription_id += 1;
        let server_subscription_id = self
            .session
            .create_subscription(
                Duration::from_millis(request.publishing_interval as u64),
                request.lifetime_count,
                request.max_keep_alive_count,
                request.max_notifications_per_publish,
                request.priority,
                request.publishing_enabled,
                Self::build_data_change_callback(
                    self.data_buffers.clone(),
                    self.subscription_bindings.clone(),
                    logical_subscription_id,
                ),
            )
            .await
            .map_err(|e| AppError::opcua(format!("Create subscription failed: {e}")))?;

        // Initialize buffer for this subscription
        self.data_buffers
            .lock()
            .entry(logical_subscription_id)
            .or_insert_with(VecDeque::new);
        self.monitored_items
            .entry(logical_subscription_id)
            .or_insert_with(Vec::new);
        self.subscription_intervals
            .insert(logical_subscription_id, request.publishing_interval);
        self.subscription_bindings.lock().insert(
            server_subscription_id,
            SubscriptionBinding {
                logical_subscription_id,
            },
        );

        // Read actual server-revised parameters from the subscription state
        let (revised_interval, revised_lifetime, revised_keepalive) = {
            let state = self.session.subscription_state().lock();
            if let Some(sub) = state.get(server_subscription_id) {
                (
                    sub.publishing_interval().as_millis() as f64,
                    sub.lifetime_count(),
                    sub.max_keep_alive_count(),
                )
            } else {
                // Fallback to requested values if subscription state is unavailable
                (request.publishing_interval, request.lifetime_count, request.max_keep_alive_count)
            }
        };

        Ok(CreateSubscriptionResult {
            subscription_id: logical_subscription_id,
            revised_publishing_interval: revised_interval,
            revised_lifetime_count: revised_lifetime,
            revised_max_keep_alive_count: revised_keepalive,
        })
    }

    /// Delete a subscription
    pub async fn delete_subscription(&mut self, subscription_id: u32) -> AppResult<()> {
        self.sync_rebound_subscriptions();
        let server_subscription_id =
            Self::resolve_server_subscription_id(&self.subscription_bindings, subscription_id);
        self.session
            .delete_subscription(server_subscription_id)
            .await
            .map_err(|e| AppError::opcua(format!("Delete subscription failed: {e}")))?;
        self.data_buffers.lock().remove(&subscription_id);
        self.monitored_items.remove(&subscription_id);
        self.subscription_intervals.remove(&subscription_id);
        self.subscription_bindings.lock().remove(&server_subscription_id);
        Ok(())
    }

    /// Add monitored items to a subscription
    pub async fn add_monitored_items(
        &mut self,
        subscription_id: u32,
        items: &[MonitoredItemRequest],
    ) -> AppResult<Vec<u32>> {
        self.sync_rebound_subscriptions();
        let mut parsed_items = Vec::with_capacity(items.len());
        let mut items_to_create = Vec::with_capacity(items.len());
        for item in items {
            let node_id = NodeId::from_str(&item.node_id).map_err(|e| {
                AppError::invalid_argument(format!("Invalid monitored item node ID '{}': {e}", item.node_id))
            })?;
            let mut req: OpcMonitoredItemCreateRequest = node_id.into();
            req.requested_parameters.sampling_interval = item.sampling_interval;
            req.requested_parameters.queue_size = item.queue_size;
            req.requested_parameters.discard_oldest = item.discard_oldest;
            items_to_create.push(req);
            parsed_items.push(item.clone());
        }

        // NOTE: Do NOT capture client_handles before sending. The SDK's
        // create_monitored_items() replaces client_handle == 0 with auto-incremented
        // values internally. We must extract the actual client_handle from the response.

        let server_subscription_id =
            Self::resolve_server_subscription_id(&self.subscription_bindings, subscription_id);

        let results = self
            .session
            .create_monitored_items(
                server_subscription_id,
                TimestampsToReturn::Both,
                items_to_create,
            )
            .await
            .map_err(|e| AppError::opcua(format!("Add monitored items failed: {e}")))?;

        let mut ids = Vec::new();
        let monitored_list = self
            .monitored_items
            .entry(subscription_id)
            .or_insert_with(Vec::new);

        for (i, result) in results.iter().enumerate() {
            let item_id = result.result.monitored_item_id;
            // Extract the actual client_handle from the SDK response.
            // This is the handle the SDK actually sent to the server and that
            // the DataChangeCallback will receive via item.client_handle().
            let client_handle = result.requested_parameters.client_handle;
            let node_id = parsed_items
                .get(i)
                .map(|it| it.node_id.clone())
                .unwrap_or_default();
            let display_name = parsed_items
                .get(i)
                .and_then(|it| it.display_name.clone())
                .unwrap_or_else(|| node_id.clone());
            info!(
                "Monitored item created: item_id={}, client_handle={}, node_id={}, display_name={}",
                item_id, client_handle, node_id, display_name
            );
            monitored_list.push(MonitoredItemState {
                logical_item_id: self.next_logical_item_id,
                client_handle,
                node_id,
                display_name,
                sampling_interval: parsed_items
                    .get(i)
                    .map(|it| it.sampling_interval)
                    .unwrap_or_default(),
            });
            ids.push(self.next_logical_item_id);
            self.next_logical_item_id += 1;
        }

        Ok(ids)
    }

    /// Remove monitored items from a subscription
    pub async fn remove_monitored_items(
        &mut self,
        subscription_id: u32,
        item_ids: &[u32],
    ) -> AppResult<()> {
        self.sync_rebound_subscriptions();
        let server_subscription_id =
            Self::resolve_server_subscription_id(&self.subscription_bindings, subscription_id);
        let client_handles = self
            .monitored_items
            .get(&subscription_id)
            .map(|items| {
                items
                    .iter()
                    .filter(|item| item_ids.contains(&item.logical_item_id))
                    .map(|item| item.client_handle)
                    .collect::<Vec<_>>()
            })
            .unwrap_or_default();
        let server_item_ids = {
            let state = self.session.subscription_state().lock();
            state
                .get(server_subscription_id)
                .map(|subscription| {
                    subscription
                        .monitored_items()
                        .filter(|item| client_handles.contains(&item.client_handle()))
                        .map(|item| item.id())
                        .collect::<Vec<_>>()
                })
                .unwrap_or_default()
        };
        self.session
            .delete_monitored_items(server_subscription_id, &server_item_ids)
            .await
            .map_err(|e| AppError::opcua(format!("Remove monitored items failed: {e}")))?;

        if let Some(items) = self.monitored_items.get_mut(&subscription_id) {
            items.retain(|item| !item_ids.contains(&item.logical_item_id));
        }
        Ok(())
    }

    /// Poll subscription for data changes
    /// The async-opcua crate uses callbacks, so we drain the buffer that callbacks fill
    pub fn poll_subscription(&self, subscription_id: u32) -> AppResult<Vec<DataChangeEvent>> {
        let mut bufs = self.data_buffers.lock();
        let mut events: Vec<DataChangeEvent> = bufs.remove(&subscription_id).unwrap_or_default().into();

        if let Some(sub_items) = self.monitored_items.get(&subscription_id) {
            for event in &mut events {
                if let Some(item) = sub_items
                    .iter()
                    .find(|item| item.client_handle == event.monitored_item_id)
                {
                    event.monitored_item_id = item.logical_item_id;
                    event.display_name = item.display_name.clone();
                    event.node_id = item.node_id.clone();
                }
            }
        }

        bufs.entry(subscription_id).or_insert_with(VecDeque::new);
        Ok(events)
    }

    pub fn sync_subscription_bindings(&mut self) {
        self.sync_rebound_subscriptions();
    }

    /// Get subscription info
    pub fn get_subscriptions(&mut self) -> Vec<SubscriptionInfo> {
        self.sync_rebound_subscriptions();
        self.monitored_items
            .iter()
            .map(|(sub_id, items)| {
                let publishing_interval = self
                    .subscription_intervals
                    .get(sub_id)
                    .copied()
                    .unwrap_or(1000.0);
                SubscriptionInfo {
                    id: *sub_id,
                    publishing_interval,
                    monitored_items: items
                        .iter()
                        .map(|item| MonitoredItemInfo {
                            id: item.logical_item_id,
                            node_id: item.node_id.clone(),
                            display_name: item.display_name.clone(),
                            sampling_interval: item.sampling_interval,
                        })
                        .collect(),
                }
            })
            .collect()
    }

    /// Call a method on the server
    pub async fn call_method(
        &self,
        request: &CallMethodRequest,
    ) -> AppResult<CallMethodResult> {
        let object_id = NodeId::from_str(&request.object_node_id)
            .map_err(|e| AppError::invalid_argument(format!("Invalid object node ID: {e}")))?;
        let method_id = NodeId::from_str(&request.method_node_id)
            .map_err(|e| AppError::invalid_argument(format!("Invalid method node ID: {e}")))?;

        let input_args: Vec<Variant> = request
            .input_arguments
            .iter()
            .map(|arg| string_to_variant(&arg.value, &arg.data_type))
            .collect::<AppResult<Vec<_>>>()?;

        let input_args_opt = if input_args.is_empty() {
            None
        } else {
            Some(input_args)
        };

        let result = self
            .session
            .call_one((object_id, method_id, input_args_opt))
            .await
            .map_err(|e| AppError::opcua(format!("Method call failed: {e}")))?;

        let output_args: Vec<String> = result
            .output_arguments
            .as_ref()
            .map(|args| args.iter().map(variant_to_string).collect())
            .unwrap_or_default();

        Ok(CallMethodResult {
            status_code: format!("{}", result.status_code),
            output_arguments: output_args,
        })
    }

    /// Discover method argument metadata by browsing for InputArguments/OutputArguments properties
    pub async fn get_method_info(
        &self,
        method_node_id: &str,
    ) -> AppResult<MethodInfo> {
        let node_id = NodeId::from_str(method_node_id)
            .map_err(|e| AppError::invalid_argument(format!("Invalid method node ID: {e}")))?;

        // Read DisplayName and BrowseName of the method node itself
        let attrs_to_read: Vec<ReadValueId> = [
            AttributeId::BrowseName,
            AttributeId::DisplayName,
            AttributeId::Description,
        ]
        .iter()
        .map(|attr| ReadValueId {
            node_id: node_id.clone(),
            attribute_id: *attr as u32,
            ..Default::default()
        })
        .collect();

        let attr_results = self
            .session
            .read(&attrs_to_read, TimestampsToReturn::Neither, 0.0)
            .await
            .map_err(|e| AppError::opcua(format!("Failed to read method attributes: {e}")))?;

        let browse_name = attr_results
            .first()
            .and_then(|dv| dv.value.as_ref())
            .map(|v| match v {
                Variant::QualifiedName(qn) => qn.name.to_string(),
                _ => variant_to_string(v),
            })
            .unwrap_or_default();

        let display_name = attr_results
            .get(1)
            .and_then(|dv| dv.value.as_ref())
            .map(variant_to_string)
            .unwrap_or_default();

        let description = attr_results
            .get(2)
            .and_then(|dv| dv.value.as_ref())
            .map(variant_to_string)
            .unwrap_or_default();

        // Browse for HasProperty references to find InputArguments/OutputArguments
        let browse_desc = BrowseDescription {
            node_id: node_id.clone(),
            browse_direction: BrowseDirection::Forward,
            reference_type_id: NodeId::new(0, 46), // HasProperty
            include_subtypes: true,
            node_class_mask: NodeClassMask::all().bits(),
            result_mask: BrowseResultMask::All as u32,
        };

        let results = self
            .session
            .browse(&[browse_desc], 0, None)
            .await
            .map_err(|e| AppError::opcua(format!("Browse method properties failed: {e}")))?;

        let refs = results
            .first()
            .and_then(|r| r.references.as_ref())
            .cloned()
            .unwrap_or_default();

        let mut input_arguments = Vec::new();
        let mut output_arguments = Vec::new();

        for reference in &refs {
            let prop_name = reference.browse_name.name.to_string();
            let is_input = prop_name == "InputArguments";
            let is_output = prop_name == "OutputArguments";
            if !is_input && !is_output {
                continue;
            }

            // Read the Value of this property node
            let prop_node_id = reference.node_id.node_id.clone();
            let read_req = vec![ReadValueId {
                node_id: prop_node_id,
                attribute_id: AttributeId::Value as u32,
                ..Default::default()
            }];

            if let Ok(read_results) = self
                .session
                .read(&read_req, TimestampsToReturn::Neither, 0.0)
                .await
            {
                if let Some(dv) = read_results.first() {
                    let args = parse_argument_array(dv);
                    if is_input {
                        input_arguments = args;
                    } else {
                        output_arguments = args;
                    }
                }
            }
        }

        Ok(MethodInfo {
            node_id: method_node_id.to_string(),
            browse_name,
            display_name,
            description,
            input_arguments,
            output_arguments,
        })
    }

    /// Subscribe to OPC UA events on the Server object.
    /// Creates a subscription with an EventCallback that monitors the Server node's EventNotifier attribute.
    pub async fn subscribe_to_events(&self) -> AppResult<u32> {
        let event_buf = self.event_buffer.clone();

        // Build select clauses for BaseEventType fields
        let select_clauses = vec![
            // [0] EventId — ByteString
            SimpleAttributeOperand {
                type_definition_id: ObjectTypeId::BaseEventType.into(),
                browse_path: Some(vec![QualifiedName::new(0, "EventId")]),
                attribute_id: AttributeId::Value as u32,
                index_range: opcua::types::NumericRange::None,
            },
            // [1] EventType — NodeId
            SimpleAttributeOperand {
                type_definition_id: ObjectTypeId::BaseEventType.into(),
                browse_path: Some(vec![QualifiedName::new(0, "EventType")]),
                attribute_id: AttributeId::Value as u32,
                index_range: opcua::types::NumericRange::None,
            },
            // [2] SourceNode — NodeId
            SimpleAttributeOperand {
                type_definition_id: ObjectTypeId::BaseEventType.into(),
                browse_path: Some(vec![QualifiedName::new(0, "SourceNode")]),
                attribute_id: AttributeId::Value as u32,
                index_range: opcua::types::NumericRange::None,
            },
            // [3] SourceName — String
            SimpleAttributeOperand {
                type_definition_id: ObjectTypeId::BaseEventType.into(),
                browse_path: Some(vec![QualifiedName::new(0, "SourceName")]),
                attribute_id: AttributeId::Value as u32,
                index_range: opcua::types::NumericRange::None,
            },
            // [4] Time — DateTime
            SimpleAttributeOperand {
                type_definition_id: ObjectTypeId::BaseEventType.into(),
                browse_path: Some(vec![QualifiedName::new(0, "Time")]),
                attribute_id: AttributeId::Value as u32,
                index_range: opcua::types::NumericRange::None,
            },
            // [5] ReceiveTime — DateTime
            SimpleAttributeOperand {
                type_definition_id: ObjectTypeId::BaseEventType.into(),
                browse_path: Some(vec![QualifiedName::new(0, "ReceiveTime")]),
                attribute_id: AttributeId::Value as u32,
                index_range: opcua::types::NumericRange::None,
            },
            // [6] Message — LocalizedText
            SimpleAttributeOperand {
                type_definition_id: ObjectTypeId::BaseEventType.into(),
                browse_path: Some(vec![QualifiedName::new(0, "Message")]),
                attribute_id: AttributeId::Value as u32,
                index_range: opcua::types::NumericRange::None,
            },
            // [7] Severity — UInt16
            SimpleAttributeOperand {
                type_definition_id: ObjectTypeId::BaseEventType.into(),
                browse_path: Some(vec![QualifiedName::new(0, "Severity")]),
                attribute_id: AttributeId::Value as u32,
                index_range: opcua::types::NumericRange::None,
            },
        ];

        let event_filter = EventFilter {
            select_clauses: Some(select_clauses),
            where_clause: ContentFilter::default(),
        };

        // Create a subscription with EventCallback
        let sub_id = self
            .session
            .create_subscription(
                Duration::from_secs(1),
                10,
                30,
                0,
                0,
                true,
                EventCallback::new(move |event_fields, _item| {
                    let fields = match event_fields {
                        Some(f) => f,
                        None => return,
                    };

                    // Extract fields by position (matching select_clauses order)
                    let event_id = fields.get(0).map(|v| match v {
                        Variant::ByteString(bs) => {
                            // Convert ByteString to hex string
                            bs.value
                                .as_ref()
                                .map(|bytes| bytes.iter().map(|b| format!("{b:02x}")).collect::<String>())
                                .unwrap_or_else(|| "unknown".to_string())
                        }
                        _ => variant_to_string(v),
                    }).unwrap_or_else(|| uuid::Uuid::new_v4().to_string());

                    let event_type = fields.get(1).map(variant_to_string).unwrap_or_default();

                    let source_node_id = fields.get(2).map(variant_to_string);

                    let source_name = fields.get(3).map(variant_to_string).unwrap_or_else(|| "Unknown".to_string());

                    let timestamp = fields.get(4).map(variant_to_string).unwrap_or_else(|| chrono::Utc::now().to_rfc3339());

                    let receive_time = fields.get(5).map(variant_to_string).unwrap_or_else(|| chrono::Utc::now().to_rfc3339());

                    let message = fields.get(6).map(variant_to_string).unwrap_or_default();

                    let severity = fields.get(7).map(|v| match v {
                        Variant::UInt16(n) => *n,
                        Variant::UInt32(n) => *n as u16,
                        Variant::Int32(n) => *n as u16,
                        _ => 0u16,
                    }).unwrap_or(0);

                    let event = EventData {
                        event_id,
                        source_name,
                        event_type,
                        severity,
                        message,
                        timestamp,
                        receive_time,
                        source_node_id,
                    };

                    debug!("EventCallback: received event from source={}", event.source_name);
                    let mut buf = event_buf.lock();
                    push_bounded(&mut buf, event);
                }),
            )
            .await
            .map_err(|e| AppError::opcua(format!("Failed to create event subscription: {e}")))?;

        info!("Created event subscription with id={}", sub_id);

        // Create a monitored item on the Server object's EventNotifier attribute
        let server_node_id: NodeId = ObjectId::Server.into();
        let event_monitor_request = OpcMonitoredItemCreateRequest {
            item_to_monitor: ReadValueId {
                node_id: server_node_id,
                attribute_id: AttributeId::EventNotifier as u32,
                ..Default::default()
            },
            monitoring_mode: MonitoringMode::Reporting,
            requested_parameters: MonitoringParameters {
                client_handle: 0,
                sampling_interval: 0.0,
                filter: ExtensionObject::from_message(event_filter),
                queue_size: 100,
                discard_oldest: true,
            },
        };

        let results = self
            .session
            .create_monitored_items(sub_id, TimestampsToReturn::Both, vec![event_monitor_request])
            .await
            .map_err(|e| AppError::opcua(format!("Failed to create event monitored item: {e}")))?;

        if let Some(result) = results.first() {
            if result.result.status_code.is_good() {
                info!("Event monitored item created successfully: item_id={}", result.result.monitored_item_id);
            } else {
                log::warn!(
                    "Event monitored item creation returned status: {}",
                    result.result.status_code
                );
            }
        }

        Ok(sub_id)
    }

    /// Drain buffered events received from the server via EventCallback
    pub fn poll_events(&self) -> Vec<EventData> {
        let mut buf = self.event_buffer.lock();
        buf.drain(..).collect()
    }

    pub async fn health(&self) -> LiveConnectionHealth {
        if self.connected.load(Ordering::Relaxed) {
            if self.reconnecting.load(Ordering::Relaxed) {
                LiveConnectionHealth::Reconnecting
            } else {
                LiveConnectionHealth::Connected
            }
        } else if self.reconnecting.load(Ordering::Relaxed) {
            LiveConnectionHealth::Reconnecting
        } else {
            LiveConnectionHealth::Disconnected
        }
    }
}

// ─── Helper functions ────────────────────────────────────────────

/// Convert a Variant to a display string
fn variant_to_string(v: &Variant) -> String {
    match v {
        Variant::Empty => "null".to_string(),
        Variant::Boolean(b) => b.to_string(),
        Variant::SByte(n) => n.to_string(),
        Variant::Byte(n) => n.to_string(),
        Variant::Int16(n) => n.to_string(),
        Variant::UInt16(n) => n.to_string(),
        Variant::Int32(n) => n.to_string(),
        Variant::UInt32(n) => n.to_string(),
        Variant::Int64(n) => n.to_string(),
        Variant::UInt64(n) => n.to_string(),
        Variant::Float(n) => format!("{n:.2}"),
        Variant::Double(n) => format!("{n:.2}"),
        Variant::String(s) => {
            let val = s.to_string();
            if val == "[null]" { String::new() } else { val }
        }
        Variant::DateTime(dt) => dt.to_string(),
        Variant::NodeId(id) => id.to_string(),
        Variant::StatusCode(sc) => format!("{sc}"),
        Variant::LocalizedText(lt) => {
            let s = lt.text.to_string();
            if s == "[null]" { String::new() } else { s }
        }
        Variant::QualifiedName(qn) => qn.to_string(),
        _ => format!("{v:?}"),
    }
}

/// Get the OPC UA type name from a Variant
fn variant_type_name(v: &Variant) -> String {
    match v {
        Variant::Empty => "Null".to_string(),
        Variant::Boolean(_) => "Boolean".to_string(),
        Variant::SByte(_) => "SByte".to_string(),
        Variant::Byte(_) => "Byte".to_string(),
        Variant::Int16(_) => "Int16".to_string(),
        Variant::UInt16(_) => "UInt16".to_string(),
        Variant::Int32(_) => "Int32".to_string(),
        Variant::UInt32(_) => "UInt32".to_string(),
        Variant::Int64(_) => "Int64".to_string(),
        Variant::UInt64(_) => "UInt64".to_string(),
        Variant::Float(_) => "Float".to_string(),
        Variant::Double(_) => "Double".to_string(),
        Variant::String(_) => "String".to_string(),
        Variant::DateTime(_) => "DateTime".to_string(),
        Variant::NodeId(_) => "NodeId".to_string(),
        Variant::StatusCode(_) => "StatusCode".to_string(),
        Variant::LocalizedText(_) => "LocalizedText".to_string(),
        Variant::QualifiedName(_) => "QualifiedName".to_string(),
        _ => "Unknown".to_string(),
    }
}

/// Convert a string value and type name back to a Variant for writing
fn string_to_variant(value: &str, data_type: &str) -> AppResult<Variant> {
    fn parse_err(data_type: &str, value: &str) -> AppError {
        AppError::invalid_argument(format!(
            "Value '{value}' is not a valid {data_type}."
        ))
    }

    match data_type {
        "Boolean" | "boolean" => match value.trim().to_ascii_lowercase().as_str() {
            "true" | "1" => Ok(Variant::Boolean(true)),
            "false" | "0" => Ok(Variant::Boolean(false)),
            _ => Err(parse_err(data_type, value)),
        },
        "SByte" | "sbyte" => value
            .parse()
            .map(Variant::SByte)
            .map_err(|_| parse_err(data_type, value)),
        "Byte" | "byte" => value
            .parse()
            .map(Variant::Byte)
            .map_err(|_| parse_err(data_type, value)),
        "Int16" | "int16" => value
            .parse()
            .map(Variant::Int16)
            .map_err(|_| parse_err(data_type, value)),
        "UInt16" | "uint16" => value
            .parse()
            .map(Variant::UInt16)
            .map_err(|_| parse_err(data_type, value)),
        "Int32" | "int32" => value
            .parse()
            .map(Variant::Int32)
            .map_err(|_| parse_err(data_type, value)),
        "UInt32" | "uint32" => value
            .parse()
            .map(Variant::UInt32)
            .map_err(|_| parse_err(data_type, value)),
        "Int64" | "int64" => value
            .parse()
            .map(Variant::Int64)
            .map_err(|_| parse_err(data_type, value)),
        "UInt64" | "uint64" => value
            .parse()
            .map(Variant::UInt64)
            .map_err(|_| parse_err(data_type, value)),
        "Float" | "float" => value
            .parse()
            .map(Variant::Float)
            .map_err(|_| parse_err(data_type, value)),
        "Double" | "double" => value
            .parse()
            .map(Variant::Double)
            .map_err(|_| parse_err(data_type, value)),
        "String" | "string" => Ok(Variant::String(opcua::types::UAString::from(value))),
        "DateTime" | "datetime" | "UtcTime" => {
            let dt = chrono::DateTime::parse_from_rfc3339(value)
                .map_err(|_| parse_err(data_type, value))?;
            Ok(Variant::DateTime(Box::new(dt.with_timezone(&chrono::Utc).into())))
        }
        "Guid" | "guid" => {
            let guid = Guid::from_str(value)
                .map_err(|_| parse_err(data_type, value))?;
            Ok(Variant::Guid(Box::new(guid)))
        }
        "NodeId" | "nodeid" => {
            let nid = NodeId::from_str(value)
                .map_err(|_| parse_err(data_type, value))?;
            Ok(Variant::NodeId(Box::new(nid)))
        }
        "ByteString" | "bytestring" => {
            // Accept hex-encoded byte strings (e.g. "48656c6c6f")
            let bytes = (0..value.len())
                .step_by(2)
                .map(|i| u8::from_str_radix(value.get(i..i + 2).unwrap_or(""), 16))
                .collect::<Result<Vec<u8>, _>>()
                .map_err(|_| parse_err(data_type, value))?;
            Ok(Variant::ByteString(opcua::types::ByteString::from(bytes)))
        }
        "StatusCode" | "statuscode" => {
            let code = value
                .parse::<u32>()
                .map_err(|_| parse_err(data_type, value))?;
            Ok(Variant::StatusCode(StatusCode::from(code)))
        }
        _ => Ok(Variant::String(opcua::types::UAString::from(value))),
    }
}

/// Convert OPC UA NodeClass integer to human-readable string
fn node_class_to_string(nc: i32) -> String {
    match nc {
        1 => "Object".to_string(),
        2 => "Variable".to_string(),
        4 => "Method".to_string(),
        8 => "ObjectType".to_string(),
        16 => "VariableType".to_string(),
        32 => "ReferenceType".to_string(),
        64 => "DataType".to_string(),
        128 => "View".to_string(),
        _ => format!("Unknown({nc})"),
    }
}

/// Convert a DataType NodeId to a human-readable type name
fn data_type_node_id_to_string(id: &opcua::types::NodeId) -> String {
    // OPC UA built-in types are in namespace 0 with numeric identifiers
    if id.namespace == 0 {
        if let opcua::types::Identifier::Numeric(n) = &id.identifier {
            return match *n {
                1 => "Boolean".to_string(),
                2 => "SByte".to_string(),
                3 => "Byte".to_string(),
                4 => "Int16".to_string(),
                5 => "UInt16".to_string(),
                6 => "Int32".to_string(),
                7 => "UInt32".to_string(),
                8 => "Int64".to_string(),
                9 => "UInt64".to_string(),
                10 => "Float".to_string(),
                11 => "Double".to_string(),
                12 => "String".to_string(),
                13 => "DateTime".to_string(),
                14 => "Guid".to_string(),
                15 => "ByteString".to_string(),
                16 => "XmlElement".to_string(),
                17 => "NodeId".to_string(),
                18 => "ExpandedNodeId".to_string(),
                19 => "StatusCode".to_string(),
                20 => "QualifiedName".to_string(),
                21 => "LocalizedText".to_string(),
                22 => "ExtensionObject".to_string(),
                23 => "DataValue".to_string(),
                24 => "Variant".to_string(),
                25 => "DiagnosticInfo".to_string(),
                26 => "Number".to_string(),
                27 => "Integer".to_string(),
                28 => "UInteger".to_string(),
                29 => "Enumeration".to_string(),
                _ => id.to_string(),
            };
        }
    }
    id.to_string()
}

fn parse_history_time(value: &str) -> AppResult<opcua::types::UtcTime> {
    chrono::DateTime::parse_from_rfc3339(value)
        .map(|dt| dt.with_timezone(&chrono::Utc).into())
        .map_err(|_| AppError::invalid_argument(format!("Invalid RFC3339 timestamp '{value}'")))
}

fn continuation_point_to_string(cp: &opcua::types::ContinuationPoint) -> Option<String> {
    let bytes = cp.value.as_ref()?;
    if bytes.is_empty() {
        None
    } else {
        Some(bytes.iter().map(|b| format!("{b:02x}")).collect())
    }
}

/// Parse an OPC UA Argument array from a DataValue (used for InputArguments/OutputArguments properties)
fn parse_argument_array(dv: &DataValue) -> Vec<MethodArgument> {
    let value = match dv.value.as_ref() {
        Some(v) => v,
        None => return vec![],
    };

    // The value should be an Array of ExtensionObject, each containing an Argument
    let ext_objects: Vec<&opcua::types::ExtensionObject> = match value {
        Variant::Array(arr) => arr
            .values
            .iter()
            .filter_map(|v| match v {
                Variant::ExtensionObject(eo) => Some(eo),
                _ => None,
            })
            .collect(),
        Variant::ExtensionObject(eo) => vec![eo],
        _ => return vec![],
    };

    ext_objects
        .into_iter()
        .filter_map(|eo| {
            let arg = eo.inner_as::<Argument>()?;
            Some(MethodArgument {
                name: {
                    let s = arg.name.to_string();
                    if s == "[null]" { String::new() } else { s }
                },
                data_type: data_type_node_id_to_string(&arg.data_type),
                description: {
                    let s = arg.description.text.to_string();
                    if s == "[null]" { String::new() } else { s }
                },
            })
        })
        .collect()
}
