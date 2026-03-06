//! OPC UA client implementation using the async-opcua crate.

use std::collections::HashMap;
use std::str::FromStr;
use std::sync::Arc;
use std::time::Duration;

use log::{debug, info};
use parking_lot::Mutex as SyncMutex;

use opcua::client::{
    ClientBuilder, DataChangeCallback, EventCallback, IdentityToken, Session,
};
use opcua::crypto::SecurityPolicy;
use opcua::types::{
    AttributeId, BrowseDescription, BrowseDirection, BrowseResultMask, ContentFilter, DataValue,
    EventFilter, ExtensionObject, MessageSecurityMode,
    MonitoredItemCreateRequest as OpcMonitoredItemCreateRequest, MonitoringMode,
    MonitoringParameters, NodeClassMask, NodeId, ObjectId, ObjectTypeId, QualifiedName,
    ReadValueId, ReferenceTypeId, SimpleAttributeOperand, StatusCode, TimestampsToReturn,
    UserTokenPolicy, Variant, WriteValue,
};

use super::types::*;

/// Holds state for a single OPC UA connection
pub struct OpcUaConnection {
    session: Arc<Session>,
    event_loop_handle: tokio::task::JoinHandle<StatusCode>,
    /// Subscription data change buffers: subscription_id -> Vec<DataChangeEvent>
    /// Filled by callbacks, drained by poll_subscription
    data_buffers: Arc<SyncMutex<HashMap<u32, Vec<DataChangeEvent>>>>,
    /// Mapping of subscription_id -> Vec<(monitored_item_id, client_handle, node_id, display_name)>
    monitored_items: HashMap<u32, Vec<(u32, u32, String, String)>>,
    /// Mapping of subscription_id -> publishing_interval (f64 ms)
    subscription_intervals: HashMap<u32, f64>,
    /// Event buffer: filled by EventCallback, drained by poll_events
    event_buffer: Arc<SyncMutex<Vec<EventData>>>,
}

impl OpcUaConnection {
    /// Connect to an OPC UA server
    pub async fn connect(config: &ConnectionConfig) -> Result<Self, String> {
        info!("Connecting to OPC UA server: {}", config.endpoint_url);

        let mut client = ClientBuilder::new()
            .application_name("IoTUI")
            .application_uri("urn:iotui:client")
            .product_uri("urn:iotui")
            .trust_server_certs(true)
            .create_sample_keypair(true)
            .session_retry_limit(3)
            .client()
            .map_err(|errs| format!("Failed to create OPC UA client: {}", errs.join(", ")))?;

        // Determine identity token
        let identity = match config.auth_type {
            AuthType::Anonymous => IdentityToken::Anonymous,
            AuthType::UsernamePassword => {
                let user = config.username.clone().unwrap_or_default();
                let pass = config.password.clone().unwrap_or_default();
                IdentityToken::new_user_name(user, pass)
            }
            AuthType::Certificate => {
                // Certificate auth not yet supported in this integration
                return Err("Certificate authentication is not yet supported for live connections. Use Anonymous or Username/Password.".to_string());
            }
        };

        // Parse security policy
        let security_policy = SecurityPolicy::from_str(&config.security_policy)
            .unwrap_or(SecurityPolicy::None);

        // Parse message security mode
        let message_security_mode = match config.security_mode.as_str() {
            "None" => MessageSecurityMode::None,
            "Sign" => MessageSecurityMode::Sign,
            "SignAndEncrypt" => MessageSecurityMode::SignAndEncrypt,
            _ => MessageSecurityMode::None,
        };

        // Determine user token policy based on auth type
        let user_token_policy = match config.auth_type {
            AuthType::Anonymous => UserTokenPolicy::anonymous(),
            AuthType::UsernamePassword => UserTokenPolicy {
                policy_id: opcua::types::UAString::from("username_basic256sha256"),
                token_type: opcua::types::UserTokenType::UserName,
                issued_token_type: opcua::types::UAString::null(),
                issuer_endpoint_url: opcua::types::UAString::null(),
                security_policy_uri: opcua::types::UAString::null(),
            },
            AuthType::Certificate => UserTokenPolicy {
                policy_id: opcua::types::UAString::from("certificate"),
                token_type: opcua::types::UserTokenType::Certificate,
                issued_token_type: opcua::types::UAString::null(),
                issuer_endpoint_url: opcua::types::UAString::null(),
                security_policy_uri: opcua::types::UAString::null(),
            },
        };

        let (session, event_loop) = client
            .connect_to_matching_endpoint(
                (
                    config.endpoint_url.as_str(),
                    security_policy.to_str(),
                    message_security_mode,
                    user_token_policy,
                ),
                identity,
            )
            .await
            .map_err(|e| format!("Failed to connect: {e}"))?;

        let handle = event_loop.spawn();

        // Wait for connection with timeout
        let wait_session = session.clone();
        let connected = tokio::time::timeout(Duration::from_secs(10), async move {
            wait_session.wait_for_connection().await;
        })
        .await;

        if connected.is_err() {
            handle.abort();
            return Err("Connection timed out after 10 seconds".to_string());
        }

        info!(
            "Successfully connected to OPC UA server: {}",
            config.endpoint_url
        );

        let conn = Self {
            session,
            event_loop_handle: handle,
            data_buffers: Arc::new(SyncMutex::new(HashMap::new())),
            monitored_items: HashMap::new(),
            subscription_intervals: HashMap::new(),
            event_buffer: Arc::new(SyncMutex::new(Vec::new())),
        };

        // Auto-subscribe to events (best-effort; don't fail the connection if this fails)
        match conn.subscribe_to_events().await {
            Ok(()) => info!("Auto-subscribed to server events"),
            Err(e) => log::warn!("Failed to auto-subscribe to events (server may not support events): {e}"),
        }

        Ok(conn)
    }

    /// Disconnect from the server
    pub async fn disconnect(&self) -> Result<(), String> {
        info!("Disconnecting from OPC UA server");
        self.session
            .disconnect()
            .await
            .map_err(|e| format!("Disconnect failed: {e}"))?;
        self.event_loop_handle.abort();
        Ok(())
    }

    /// Discover endpoints from a URL
    pub async fn discover_endpoints(url: &str) -> Result<Vec<EndpointInfo>, String> {
        info!("Discovering endpoints at: {}", url);

        let mut client = ClientBuilder::new()
            .application_name("IoTUI Discovery")
            .application_uri("urn:iotui:discovery")
            .trust_server_certs(true)
            .create_sample_keypair(true)
            .client()
            .map_err(|errs| format!("Failed to create discovery client: {}", errs.join(", ")))?;

        let endpoints = client
            .get_server_endpoints_from_url(url)
            .await
            .map_err(|e| format!("Failed to discover endpoints: {e}"))?;

        Ok(endpoints
            .iter()
            .map(|ep| {
                let security_policy =
                    SecurityPolicy::from_str(ep.security_policy_uri.as_ref()).unwrap_or(SecurityPolicy::None);

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
                    security_policy: security_policy.to_str().to_string(),
                    security_mode,
                    user_identity_tokens: tokens,
                }
            })
            .collect())
    }

    /// Browse child nodes of a given node
    pub async fn browse(&self, node_id_str: &str) -> Result<Vec<BrowseNode>, String> {
        let node_id =
            NodeId::from_str(node_id_str).map_err(|e| format!("Invalid node ID: {e}"))?;

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
            .map_err(|e| format!("Browse failed: {e}"))?;

        if results.is_empty() {
            return Ok(vec![]);
        }

        let result = &results[0];

        let references = result
            .references
            .as_ref()
            .map(|refs| {
                refs.iter()
                    .map(|r| {
                        let node_class = format!("{:?}", r.node_class);
                        // A node has children if it's an Object or a View
                        let has_children = matches!(
                            r.node_class,
                            opcua::types::NodeClass::Object | opcua::types::NodeClass::View
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
            .unwrap_or_default();

        Ok(references)
    }

    /// Read detailed attributes of a node
    pub async fn read_node_details(&self, node_id_str: &str) -> Result<NodeDetails, String> {
        let node_id =
            NodeId::from_str(node_id_str).map_err(|e| format!("Invalid node ID: {e}"))?;

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
            .map_err(|e| format!("Read failed: {e}"))?;

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
                    data_type: Some("String".to_string()),
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
    async fn get_references(&self, node_id_str: &str) -> Result<Vec<ReferenceInfo>, String> {
        let node_id =
            NodeId::from_str(node_id_str).map_err(|e| format!("Invalid node ID: {e}"))?;

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
            .map_err(|e| format!("Browse references failed: {e}"))?;

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
    pub async fn read_values(&self, node_ids: &[String]) -> Result<Vec<ReadResult>, String> {
        let read_value_ids: Vec<ReadValueId> = node_ids
            .iter()
            .filter_map(|id| {
                NodeId::from_str(id).ok().map(|node_id| ReadValueId {
                    node_id,
                    attribute_id: AttributeId::Value as u32,
                    ..Default::default()
                })
            })
            .collect();

        if read_value_ids.is_empty() {
            return Ok(vec![]);
        }

        let results = self
            .session
            .read(&read_value_ids, TimestampsToReturn::Both, 0.0)
            .await
            .map_err(|e| format!("Read failed: {e}"))?;

        Ok(results
            .iter()
            .enumerate()
            .map(|(i, dv)| {
                let node_id = node_ids.get(i).cloned().unwrap_or_default();
                ReadResult {
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
                }
            })
            .collect())
    }

    /// Write a value to a node
    pub async fn write_value(&self, request: &WriteRequest) -> Result<WriteResult, String> {
        let node_id =
            NodeId::from_str(&request.node_id).map_err(|e| format!("Invalid node ID: {e}"))?;

        let variant = string_to_variant(&request.value, &request.data_type);
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
            .map_err(|e| format!("Write failed: {e}"))?;

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

    /// Create a subscription on the server
    pub async fn create_subscription(
        &mut self,
        request: &CreateSubscriptionRequest,
    ) -> Result<CreateSubscriptionResult, String> {
        let buffers = self.data_buffers.clone();

        let subscription_id = self
            .session
            .create_subscription(
                Duration::from_millis(request.publishing_interval as u64),
                request.lifetime_count,
                request.max_keep_alive_count,
                request.max_notifications_per_publish,
                request.priority,
                request.publishing_enabled,
                DataChangeCallback::new(move |dv, item| {
                    let node_id_str = item.item_to_monitor().node_id.to_string();
                    let display_name = node_id_str.clone(); // Will be enriched later
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
                    let server_ts = dv.server_timestamp.as_ref().map(|ts| ts.to_string());
                    let source_ts = dv.source_timestamp.as_ref().map(|ts| ts.to_string());

                    let client_handle = item.client_handle();
                    debug!(
                        "DataChangeCallback: client_handle={}, node_id={}, value={}",
                        client_handle, node_id_str, value_str
                    );

                    let event = DataChangeEvent {
                        subscription_id: 0, // Will be set during poll
                        monitored_item_id: client_handle,
                        node_id: node_id_str,
                        display_name,
                        value: value_str,
                        data_type,
                        status_code: status,
                        source_timestamp: source_ts,
                        server_timestamp: server_ts,
                    };

                    // Store in buffer for all subscriptions (we'll filter by item later)
                    let mut bufs = buffers.lock();
                    bufs.entry(0).or_insert_with(Vec::new).push(event);
                }),
            )
            .await
            .map_err(|e| format!("Create subscription failed: {e}"))?;

        // Initialize buffer for this subscription
        self.data_buffers
            .lock()
            .entry(subscription_id)
            .or_insert_with(Vec::new);
        self.monitored_items
            .entry(subscription_id)
            .or_insert_with(Vec::new);
        self.subscription_intervals
            .insert(subscription_id, request.publishing_interval);

        Ok(CreateSubscriptionResult {
            subscription_id,
            revised_publishing_interval: request.publishing_interval,
            revised_lifetime_count: request.lifetime_count,
            revised_max_keep_alive_count: request.max_keep_alive_count,
        })
    }

    /// Delete a subscription
    pub async fn delete_subscription(&mut self, subscription_id: u32) -> Result<(), String> {
        self.session
            .delete_subscription(subscription_id)
            .await
            .map_err(|e| format!("Delete subscription failed: {e}"))?;
        self.data_buffers.lock().remove(&subscription_id);
        self.monitored_items.remove(&subscription_id);
        self.subscription_intervals.remove(&subscription_id);
        Ok(())
    }

    /// Add monitored items to a subscription
    pub async fn add_monitored_items(
        &mut self,
        subscription_id: u32,
        items: &[MonitoredItemRequest],
    ) -> Result<Vec<u32>, String> {
        let items_to_create: Vec<OpcMonitoredItemCreateRequest> = items
            .iter()
            .filter_map(|item| {
                NodeId::from_str(&item.node_id).ok().map(|node_id| {
                    let mut req: OpcMonitoredItemCreateRequest = node_id.into();
                    req.requested_parameters.sampling_interval = item.sampling_interval;
                    req.requested_parameters.queue_size = item.queue_size;
                    req.requested_parameters.discard_oldest = item.discard_oldest;
                    req
                })
            })
            .collect();

        // NOTE: Do NOT capture client_handles before sending. The SDK's
        // create_monitored_items() replaces client_handle == 0 with auto-incremented
        // values internally. We must extract the actual client_handle from the response.

        let results = self
            .session
            .create_monitored_items(
                subscription_id,
                TimestampsToReturn::Both,
                items_to_create,
            )
            .await
            .map_err(|e| format!("Add monitored items failed: {e}"))?;

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
            let node_id = items
                .get(i)
                .map(|it| it.node_id.clone())
                .unwrap_or_default();
            let display_name = items
                .get(i)
                .and_then(|it| it.display_name.clone())
                .unwrap_or_else(|| node_id.clone());
            info!(
                "Monitored item created: item_id={}, client_handle={}, node_id={}, display_name={}",
                item_id, client_handle, node_id, display_name
            );
            monitored_list.push((item_id, client_handle, node_id, display_name));
            ids.push(item_id);
        }

        Ok(ids)
    }

    /// Remove monitored items from a subscription
    pub async fn remove_monitored_items(
        &mut self,
        subscription_id: u32,
        item_ids: &[u32],
    ) -> Result<(), String> {
        self.session
            .delete_monitored_items(subscription_id, item_ids)
            .await
            .map_err(|e| format!("Remove monitored items failed: {e}"))?;

        if let Some(items) = self.monitored_items.get_mut(&subscription_id) {
            items.retain(|(id, _, _, _)| !item_ids.contains(id));
        }
        Ok(())
    }

    /// Poll subscription for data changes
    /// The async-opcua crate uses callbacks, so we drain the buffer that callbacks fill
    pub fn poll_subscription(&self, subscription_id: u32) -> Result<Vec<DataChangeEvent>, String> {
        let mut bufs = self.data_buffers.lock();

        // Get items for this subscription to know which client_handles belong to it
        let sub_items = self
            .monitored_items
            .get(&subscription_id)
            .cloned()
            .unwrap_or_default();
        // Build set of client_handles (what the callback uses as monitored_item_id)
        let sub_client_handles: std::collections::HashSet<u32> =
            sub_items.iter().map(|(_, ch, _, _)| *ch).collect();

        // Drain the global callback buffer (key=0) and filter for this subscription
        let mut events = Vec::new();
        if let Some(global_buf) = bufs.get_mut(&0) {
            if !global_buf.is_empty() {
                debug!(
                    "poll_subscription({}): {} events in global buffer, looking for client_handles {:?}",
                    subscription_id,
                    global_buf.len(),
                    sub_client_handles
                );
            }
            let mut remaining = Vec::new();
            for mut event in global_buf.drain(..) {
                if sub_client_handles.contains(&event.monitored_item_id) {
                    event.subscription_id = subscription_id;
                    // Enrich display_name from our stored mapping
                    if let Some((_, _, _, display)) = sub_items
                        .iter()
                        .find(|(_, ch, _, _)| *ch == event.monitored_item_id)
                    {
                        event.display_name = display.clone();
                    }
                    events.push(event);
                } else {
                    remaining.push(event);
                }
            }
            *global_buf = remaining;
        }

        if !events.is_empty() {
            debug!(
                "poll_subscription({}): returning {} events",
                subscription_id,
                events.len()
            );
        }

        Ok(events)
    }

    /// Get subscription info
    pub fn get_subscriptions(&self) -> Vec<SubscriptionInfo> {
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
                        .map(|(item_id, _, node_id, display_name)| MonitoredItemInfo {
                            id: *item_id,
                            node_id: node_id.clone(),
                            display_name: display_name.clone(),
                            sampling_interval: publishing_interval,
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
    ) -> Result<CallMethodResult, String> {
        let object_id = NodeId::from_str(&request.object_node_id)
            .map_err(|e| format!("Invalid object node ID: {e}"))?;
        let method_id = NodeId::from_str(&request.method_node_id)
            .map_err(|e| format!("Invalid method node ID: {e}"))?;

        let input_args: Vec<Variant> = request
            .input_arguments
            .iter()
            .map(|arg| string_to_variant(&arg.value, &arg.data_type))
            .collect();

        let input_args_opt = if input_args.is_empty() {
            None
        } else {
            Some(input_args)
        };

        let result = self
            .session
            .call_one((object_id, method_id, input_args_opt))
            .await
            .map_err(|e| format!("Method call failed: {e}"))?;

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
    ) -> Result<MethodInfo, String> {
        let node_id = NodeId::from_str(method_node_id)
            .map_err(|e| format!("Invalid method node ID: {e}"))?;

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
            .map_err(|e| format!("Failed to read method attributes: {e}"))?;

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
            .map_err(|e| format!("Browse method properties failed: {e}"))?;

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
    pub async fn subscribe_to_events(&self) -> Result<(), String> {
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
                    event_buf.lock().push(event);
                }),
            )
            .await
            .map_err(|e| format!("Failed to create event subscription: {e}"))?;

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
            .map_err(|e| format!("Failed to create event monitored item: {e}"))?;

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

        Ok(())
    }

    /// Drain buffered events received from the server via EventCallback
    pub fn poll_events(&self) -> Vec<EventData> {
        let mut buf = self.event_buffer.lock();
        buf.drain(..).collect()
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
fn string_to_variant(value: &str, data_type: &str) -> Variant {
    match data_type {
        "Boolean" | "boolean" => Variant::Boolean(value.parse().unwrap_or(false)),
        "SByte" | "sbyte" => Variant::SByte(value.parse().unwrap_or(0)),
        "Byte" | "byte" => Variant::Byte(value.parse().unwrap_or(0)),
        "Int16" | "int16" => Variant::Int16(value.parse().unwrap_or(0)),
        "UInt16" | "uint16" => Variant::UInt16(value.parse().unwrap_or(0)),
        "Int32" | "int32" => Variant::Int32(value.parse().unwrap_or(0)),
        "UInt32" | "uint32" => Variant::UInt32(value.parse().unwrap_or(0)),
        "Int64" | "int64" => Variant::Int64(value.parse().unwrap_or(0)),
        "UInt64" | "uint64" => Variant::UInt64(value.parse().unwrap_or(0)),
        "Float" | "float" => Variant::Float(value.parse().unwrap_or(0.0)),
        "Double" | "double" => Variant::Double(value.parse().unwrap_or(0.0)),
        _ => Variant::String(opcua::types::UAString::from(value)),
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
            let arg = eo.inner_as::<opcua::types::argument::Argument>()?;
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
