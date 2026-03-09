use crate::mqtt::MqttManager;
use crate::ua_client::UaClientManager;

pub struct AppState {
    pub ua_manager: UaClientManager,
    pub mqtt_manager: MqttManager,
}

impl AppState {
    pub fn new() -> Self {
        Self {
            ua_manager: UaClientManager::new(),
            mqtt_manager: MqttManager::new(),
        }
    }
}

impl Default for AppState {
    fn default() -> Self {
        Self::new()
    }
}
