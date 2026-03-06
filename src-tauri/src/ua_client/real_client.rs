//! Real OPC UA client implementation using the async-opcua crate.
//! This module is only compiled when the `opcua-live` feature is enabled.

use std::collections::HashMap;
use std::str::FromStr;
use std::sync::Arc;
use std::time::Duration;

use log::{info, warn};
use parking_lot::Mutex as SyncMutex;

use opcua::client::{
    ClientBuilder, DataChangeCallback, IdentityToken, Session,
};
use opcua::crypto::SecurityPolicy;
use opcua::types::{
    AttributeId, BrowseDescription, BrowseDirection, BrowseResultMask, DataValue,
    MessageSecurityMode, MonitoredItemCreateRequest as OpcMonitoredItemCreateRequest, NodeClassMask,
    NodeId, ReadValueId, ReferenceTypeId, StatusCode, TimestampsToReturn, UserTokenPolicy, Variant,
    WriteValue,
};

use super::types::*;

/// Holds state for a single real OPC UA connection
pub struct RealOpcUaConnection {
    session: Arc<Session>,
    event_loop_handle: tokio::task::JoinHandle<StatusCode>,
    /// Subscription data change buffers: subscription_id -> Vec<DataChangeEvent>
    /// Filled by callbacks, drained by poll_subscription
    data_buffers: Arc<SyncMutex<HashMap<u32, Vec<DataChangeEvent>>>>,
    /// Mapping of our internal monitored_item_id -> (node_id, display_name) for each subscription
    monitored_items: HashMap<u32, Vec<(u32, String, String)>>,
}

impl RealOpcUaConnection {
    /// Connect to a real OPC UA server
    pub async fn connect(config: &ConnectionConfig) -> Result<Self, String> {
        info!("Connecting to real OPC UA server: {}", config.endpoint_url);

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

        Ok(Self {
            session,
            event_loop_handle: handle,
            data_buffers: Arc::new(SyncMutex::new(HashMap::new())),
            monitored_items: HashMap::new(),
        })
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

                    // We need the subscription_id from the outer context.
                    // Since we don't have it here yet (chicken-and-egg), we'll
                    // store events with sub_id=0 and fix them in poll_subscription.
                    // Actually, the item has client_handle which maps to monitored_item_id.
                    let event = DataChangeEvent {
                        subscription_id: 0, // Will be set during poll
                        monitored_item_id: item.client_handle(),
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
                    // Add to a "global" buffer keyed by 0; will be dispatched in poll
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
            let node_id = items
                .get(i)
                .map(|it| it.node_id.clone())
                .unwrap_or_default();
            let display_name = items
                .get(i)
                .and_then(|it| it.display_name.clone())
                .unwrap_or_else(|| node_id.clone());
            monitored_list.push((item_id, node_id, display_name));
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
            items.retain(|(id, _, _)| !item_ids.contains(id));
        }
        Ok(())
    }

    /// Poll subscription for data changes
    /// The async-opcua crate uses callbacks, so we drain the buffer that callbacks fill
    pub fn poll_subscription(&self, subscription_id: u32) -> Result<Vec<DataChangeEvent>, String> {
        let mut bufs = self.data_buffers.lock();

        // Get items for this subscription to know which node_ids belong to it
        let sub_items = self
            .monitored_items
            .get(&subscription_id)
            .cloned()
            .unwrap_or_default();
        let sub_item_ids: std::collections::HashSet<u32> =
            sub_items.iter().map(|(id, _, _)| *id).collect();

        // Drain the global callback buffer (key=0) and filter for this subscription
        let mut events = Vec::new();
        if let Some(global_buf) = bufs.get_mut(&0) {
            let mut remaining = Vec::new();
            for mut event in global_buf.drain(..) {
                if sub_item_ids.contains(&event.monitored_item_id) {
                    event.subscription_id = subscription_id;
                    // Enrich display_name from our stored mapping
                    if let Some((_, _, display)) = sub_items
                        .iter()
                        .find(|(id, _, _)| *id == event.monitored_item_id)
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

        Ok(events)
    }

    /// Get subscription info
    pub fn get_subscriptions(&self) -> Vec<SubscriptionInfo> {
        self.monitored_items
            .iter()
            .map(|(sub_id, items)| SubscriptionInfo {
                id: *sub_id,
                publishing_interval: 1000.0, // Default; actual interval tracked by server
                monitored_items: items
                    .iter()
                    .map(|(item_id, node_id, display_name)| MonitoredItemInfo {
                        id: *item_id,
                        node_id: node_id.clone(),
                        display_name: display_name.clone(),
                        sampling_interval: 1000.0,
                    })
                    .collect(),
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
            .map(|arg| Variant::String(opcua::types::UAString::from(arg.as_str())))
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
        Variant::String(s) => s.to_string(),
        Variant::DateTime(dt) => dt.to_string(),
        Variant::NodeId(id) => id.to_string(),
        Variant::StatusCode(sc) => format!("{sc}"),
        Variant::LocalizedText(lt) => lt.text.to_string(),
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
