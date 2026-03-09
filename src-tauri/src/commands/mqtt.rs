use crate::error::AppError;
use crate::state::AppState;
use crate::mqtt::types::*;
use tauri::State;

// ─── Connection Commands ─────────────────────────────────────────

#[tauri::command]
pub async fn mqtt_connect(
    state: State<'_, AppState>,
    config: MqttConnectionConfig,
) -> Result<String, AppError> {
    state.mqtt_manager.connect(config).await
}

#[tauri::command]
pub async fn mqtt_disconnect(
    state: State<'_, AppState>,
    connection_id: String,
) -> Result<(), AppError> {
    state.mqtt_manager.disconnect(&connection_id).await
}

#[tauri::command]
pub async fn mqtt_get_connections(
    state: State<'_, AppState>,
) -> Result<Vec<MqttConnectionInfo>, AppError> {
    Ok(state.mqtt_manager.list_connections().await)
}

#[tauri::command]
pub async fn mqtt_get_connection_status(
    state: State<'_, AppState>,
    connection_id: String,
) -> Result<MqttConnectionStatus, AppError> {
    state.mqtt_manager.get_status(&connection_id).await
}

// ─── Subscription Commands ───────────────────────────────────────

#[tauri::command]
pub async fn mqtt_subscribe(
    state: State<'_, AppState>,
    connection_id: String,
    request: MqttSubscribeRequest,
) -> Result<MqttSubscriptionInfo, AppError> {
    state
        .mqtt_manager
        .subscribe(&connection_id, &request)
        .await
}

#[tauri::command]
pub async fn mqtt_unsubscribe(
    state: State<'_, AppState>,
    connection_id: String,
    subscription_id: u32,
) -> Result<(), AppError> {
    state
        .mqtt_manager
        .unsubscribe(&connection_id, subscription_id)
        .await
}

#[tauri::command]
pub async fn mqtt_get_subscriptions(
    state: State<'_, AppState>,
    connection_id: String,
) -> Result<Vec<MqttSubscriptionInfo>, AppError> {
    state
        .mqtt_manager
        .get_subscriptions(&connection_id)
        .await
}

// ─── Publish Commands ────────────────────────────────────────────

#[tauri::command]
pub async fn mqtt_publish(
    state: State<'_, AppState>,
    connection_id: String,
    request: MqttPublishRequest,
) -> Result<(), AppError> {
    state
        .mqtt_manager
        .publish(&connection_id, &request)
        .await
}

// ─── Poll Commands ───────────────────────────────────────────────

#[tauri::command]
pub async fn mqtt_poll_messages(
    state: State<'_, AppState>,
    connection_id: String,
) -> Result<MqttPollResponse, AppError> {
    state.mqtt_manager.poll_messages(&connection_id).await
}

// ─── Topic Commands ──────────────────────────────────────────────

#[tauri::command]
pub async fn mqtt_get_topics(
    state: State<'_, AppState>,
    connection_id: String,
) -> Result<Vec<MqttTopicInfo>, AppError> {
    state.mqtt_manager.get_topics(&connection_id).await
}

// ─── Broker Admin Commands ───────────────────────────────────────

#[tauri::command]
pub async fn mqtt_get_broker_stats(
    state: State<'_, AppState>,
    connection_id: String,
) -> Result<BrokerStats, AppError> {
    state
        .mqtt_manager
        .get_broker_stats(&connection_id)
        .await
}

#[tauri::command]
pub async fn mqtt_get_broker_clients(
    state: State<'_, AppState>,
    connection_id: String,
) -> Result<Vec<BrokerClientInfo>, AppError> {
    state
        .mqtt_manager
        .get_broker_clients(&connection_id)
        .await
}
