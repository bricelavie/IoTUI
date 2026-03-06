mod commands;
mod error;
mod logging;
mod state;
mod ua_client;

use state::AppState;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    logging::init(log::LevelFilter::Info);

    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
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
            commands::opcua::opcua_create_subscription,
            commands::opcua::opcua_add_monitored_items,
            commands::opcua::opcua_delete_subscription,
            commands::opcua::opcua_poll_subscription,
            commands::opcua::opcua_get_subscriptions,
            commands::opcua::opcua_call_method,
            commands::opcua::opcua_get_method_info,
            commands::opcua::opcua_remove_monitored_items,
            commands::opcua::opcua_poll_events,
            commands::opcua::opcua_get_backend_logs,
            commands::opcua::opcua_set_log_level,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
