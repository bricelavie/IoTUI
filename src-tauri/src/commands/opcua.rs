use crate::logging;
use crate::error::AppResult;
use crate::state::AppState;
use crate::ua_client::types::*;
use tauri::State;

fn into_string_result<T>(result: AppResult<T>) -> Result<T, String> {
    result.map_err(|err| err.to_string())
}

// ─── Connection Commands ─────────────────────────────────────────

#[tauri::command]
pub async fn opcua_connect(
    state: State<'_, AppState>,
    config: ConnectionConfig,
) -> Result<String, String> {
    into_string_result(state.ua_manager.connect(config).await)
}

#[tauri::command]
pub async fn opcua_disconnect(
    state: State<'_, AppState>,
    connection_id: String,
) -> Result<(), String> {
    into_string_result(state.ua_manager.disconnect(&connection_id).await)
}

#[tauri::command]
pub async fn opcua_discover_endpoints(
    state: State<'_, AppState>,
    url: String,
) -> Result<Vec<EndpointInfo>, String> {
    into_string_result(state.ua_manager.discover_endpoints(&url).await)
}

#[tauri::command]
pub async fn opcua_get_connections(
    state: State<'_, AppState>,
) -> Result<Vec<ConnectionInfo>, String> {
    Ok(state.ua_manager.list_connections().await)
}

#[tauri::command]
pub async fn opcua_get_connection_status(
    state: State<'_, AppState>,
    connection_id: String,
) -> Result<ConnectionStatus, String> {
    into_string_result(state.ua_manager.get_status(&connection_id).await)
}

// ─── Browse Commands ─────────────────────────────────────────────

#[tauri::command]
pub async fn opcua_browse(
    state: State<'_, AppState>,
    connection_id: String,
    node_id: String,
) -> Result<Vec<BrowseNode>, String> {
    into_string_result(state.ua_manager.browse(&connection_id, &node_id).await)
}

#[tauri::command]
pub async fn opcua_read_node_details(
    state: State<'_, AppState>,
    connection_id: String,
    node_id: String,
) -> Result<NodeDetails, String> {
    into_string_result(state
        .ua_manager
        .read_node_details(&connection_id, &node_id)
        .await)
}

// ─── Read/Write Commands ─────────────────────────────────────────

#[tauri::command]
pub async fn opcua_read_values(
    state: State<'_, AppState>,
    connection_id: String,
    node_ids: Vec<String>,
) -> Result<Vec<ReadResult>, String> {
    into_string_result(state
        .ua_manager
        .read_values(&connection_id, &node_ids)
        .await)
}

#[tauri::command]
pub async fn opcua_write_value(
    state: State<'_, AppState>,
    connection_id: String,
    request: WriteRequest,
) -> Result<WriteResult, String> {
    into_string_result(state
        .ua_manager
        .write_value(&connection_id, &request)
        .await)
}

#[tauri::command]
pub async fn opcua_read_history(
    state: State<'_, AppState>,
    connection_id: String,
    request: HistoryReadRequest,
) -> Result<HistoryReadResult, String> {
    into_string_result(state
        .ua_manager
        .read_history(&connection_id, &request)
        .await)
}

// ─── Subscription Commands ───────────────────────────────────────

#[tauri::command]
pub async fn opcua_create_subscription(
    state: State<'_, AppState>,
    connection_id: String,
    request: CreateSubscriptionRequest,
) -> Result<CreateSubscriptionResult, String> {
    into_string_result(state
        .ua_manager
        .create_subscription(&connection_id, &request)
        .await)
}

#[tauri::command]
pub async fn opcua_add_monitored_items(
    state: State<'_, AppState>,
    connection_id: String,
    subscription_id: u32,
    items: Vec<MonitoredItemRequest>,
) -> Result<Vec<u32>, String> {
    into_string_result(state
        .ua_manager
        .add_monitored_items(&connection_id, subscription_id, &items)
        .await)
}

#[tauri::command]
pub async fn opcua_delete_subscription(
    state: State<'_, AppState>,
    connection_id: String,
    subscription_id: u32,
) -> Result<(), String> {
    into_string_result(state
        .ua_manager
        .delete_subscription(&connection_id, subscription_id)
        .await)
}

#[tauri::command]
pub async fn opcua_poll_subscription(
    state: State<'_, AppState>,
    connection_id: String,
    subscription_id: u32,
) -> Result<Vec<DataChangeEvent>, String> {
    into_string_result(state
        .ua_manager
        .poll_subscription(&connection_id, subscription_id)
        .await)
}

#[tauri::command]
pub async fn opcua_get_subscriptions(
    state: State<'_, AppState>,
    connection_id: String,
) -> Result<Vec<SubscriptionInfo>, String> {
    into_string_result(state
        .ua_manager
        .get_subscriptions(&connection_id)
        .await)
}

// ─── Method Calls ────────────────────────────────────────────────

#[tauri::command]
pub async fn opcua_get_method_info(
    state: State<'_, AppState>,
    connection_id: String,
    method_node_id: String,
) -> Result<MethodInfo, String> {
    into_string_result(state
        .ua_manager
        .get_method_info(&connection_id, &method_node_id)
        .await)
}

#[tauri::command]
pub async fn opcua_call_method(
    state: State<'_, AppState>,
    connection_id: String,
    request: CallMethodRequest,
) -> Result<CallMethodResult, String> {
    into_string_result(state
        .ua_manager
        .call_method(&connection_id, &request)
        .await)
}

#[tauri::command]
pub async fn opcua_remove_monitored_items(
    state: State<'_, AppState>,
    connection_id: String,
    subscription_id: u32,
    item_ids: Vec<u32>,
) -> Result<(), String> {
    into_string_result(state
        .ua_manager
        .remove_monitored_items(&connection_id, subscription_id, &item_ids)
        .await)
}

// ─── Events ──────────────────────────────────────────────────────

#[tauri::command]
pub async fn opcua_poll_events(
    state: State<'_, AppState>,
    connection_id: String,
) -> Result<Vec<EventData>, String> {
    into_string_result(state.ua_manager.poll_events(&connection_id).await)
}

// ─── Logging ─────────────────────────────────────────────────────

#[tauri::command]
pub async fn opcua_get_backend_logs() -> Result<Vec<logging::BackendLogEntry>, String> {
    Ok(logging::drain_logs())
}

#[tauri::command]
pub async fn opcua_set_log_level(level: String) -> Result<String, String> {
    let filter = logging::parse_level(&level);
    logging::set_level(filter);
    Ok(logging::current_level().to_string().to_lowercase())
}
