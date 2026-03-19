use crate::error::AppError;
use crate::modbus::types::*;
use crate::state::AppState;
use tauri::State;

// ─── Connection Commands ─────────────────────────────────────────

#[tauri::command]
pub async fn modbus_connect(
    state: State<'_, AppState>,
    config: ModbusConnectionConfig,
) -> Result<String, AppError> {
    state.modbus_manager.connect(config).await
}

#[tauri::command]
pub async fn modbus_disconnect(
    state: State<'_, AppState>,
    connection_id: String,
) -> Result<(), AppError> {
    state.modbus_manager.disconnect(&connection_id).await
}

#[tauri::command]
pub async fn modbus_get_connections(
    state: State<'_, AppState>,
) -> Result<Vec<ModbusConnectionInfo>, AppError> {
    Ok(state.modbus_manager.list_connections().await)
}

#[tauri::command]
pub async fn modbus_get_connection_status(
    state: State<'_, AppState>,
    connection_id: String,
) -> Result<ModbusConnectionStatus, AppError> {
    state.modbus_manager.get_status(&connection_id).await
}

// ─── Register Read / Write Commands ──────────────────────────────

#[tauri::command]
pub async fn modbus_read_registers(
    state: State<'_, AppState>,
    connection_id: String,
    request: RegisterReadRequest,
) -> Result<Vec<RegisterValue>, AppError> {
    state
        .modbus_manager
        .read_registers(&connection_id, &request)
        .await
}

#[tauri::command]
pub async fn modbus_write_registers(
    state: State<'_, AppState>,
    connection_id: String,
    request: RegisterWriteRequest,
) -> Result<Vec<RegisterWriteResult>, AppError> {
    state
        .modbus_manager
        .write_registers(&connection_id, &request)
        .await
}

// ─── Monitor Commands ────────────────────────────────────────────

#[tauri::command]
pub async fn modbus_add_monitor(
    state: State<'_, AppState>,
    connection_id: String,
    request: MonitorRequest,
) -> Result<MonitoredRegister, AppError> {
    state
        .modbus_manager
        .add_monitor(&connection_id, &request)
        .await
}

#[tauri::command]
pub async fn modbus_remove_monitor(
    state: State<'_, AppState>,
    connection_id: String,
    monitor_id: u32,
) -> Result<(), AppError> {
    state
        .modbus_manager
        .remove_monitor(&connection_id, monitor_id)
        .await
}

#[tauri::command]
pub async fn modbus_get_monitors(
    state: State<'_, AppState>,
    connection_id: String,
) -> Result<Vec<MonitoredRegister>, AppError> {
    state
        .modbus_manager
        .get_monitors(&connection_id)
        .await
}

#[tauri::command]
pub async fn modbus_poll_monitors(
    state: State<'_, AppState>,
    connection_id: String,
) -> Result<ModbusPollResponse, AppError> {
    state.modbus_manager.poll_monitors(&connection_id).await
}
