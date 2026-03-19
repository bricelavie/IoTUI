mod commands;
mod error;
mod logging;
mod modbus;
mod mqtt;
mod state;
mod ua_client;

use state::AppState;
use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    logging::init(log::LevelFilter::Info);

    tauri::Builder::default()
        .manage(AppState::new())
        .invoke_handler(tauri::generate_handler![
            commands::opcua::opcua_connect,
            commands::opcua::opcua_disconnect,
            commands::opcua::opcua_discover_endpoints,
            commands::opcua::opcua_get_connections,
            commands::opcua::opcua_get_connection_status,
            commands::opcua::opcua_browse,
            commands::opcua::opcua_read_node_details,
            commands::opcua::opcua_read_values,
            commands::opcua::opcua_write_value,
            commands::opcua::opcua_read_history,
            commands::opcua::opcua_create_subscription,
            commands::opcua::opcua_add_monitored_items,
            commands::opcua::opcua_delete_subscription,
            commands::opcua::opcua_poll_subscription,
            commands::opcua::opcua_get_subscriptions,
            commands::opcua::opcua_call_method,
            commands::opcua::opcua_get_method_info,
            commands::opcua::opcua_remove_monitored_items,
            commands::opcua::opcua_poll_events,
            commands::opcua::get_backend_logs,
            commands::opcua::set_log_level,
            // MQTT commands
            commands::mqtt::mqtt_connect,
            commands::mqtt::mqtt_disconnect,
            commands::mqtt::mqtt_get_connections,
            commands::mqtt::mqtt_get_connection_status,
            commands::mqtt::mqtt_subscribe,
            commands::mqtt::mqtt_unsubscribe,
            commands::mqtt::mqtt_get_subscriptions,
            commands::mqtt::mqtt_publish,
            commands::mqtt::mqtt_poll_messages,
            commands::mqtt::mqtt_get_topics,
            commands::mqtt::mqtt_get_broker_stats,
            commands::mqtt::mqtt_get_broker_clients,
            // Modbus commands
            commands::modbus::modbus_connect,
            commands::modbus::modbus_disconnect,
            commands::modbus::modbus_get_connections,
            commands::modbus::modbus_get_connection_status,
            commands::modbus::modbus_read_registers,
            commands::modbus::modbus_write_registers,
            commands::modbus::modbus_add_monitor,
            commands::modbus::modbus_remove_monitor,
            commands::modbus::modbus_get_monitors,
            commands::modbus::modbus_poll_monitors,
        ])
        .build(tauri::generate_context!())
        .expect("error while building tauri application")
        .run(|app, event| {
            if let tauri::RunEvent::Exit = event {
                // Gracefully disconnect all active sessions on shutdown
                // to avoid orphaned server-side sessions lingering until timeout.
                let state = app.state::<AppState>();
                let rt = tokio::runtime::Handle::current();
                rt.block_on(state.ua_manager.disconnect_all());
                rt.block_on(state.mqtt_manager.disconnect_all());
                rt.block_on(state.modbus_manager.disconnect_all());
            }
        });
}
