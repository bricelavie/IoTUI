use crate::ua_client::UaClientManager;

pub struct AppState {
    pub ua_manager: UaClientManager,
}

impl AppState {
    pub fn new() -> Self {
        Self {
            ua_manager: UaClientManager::new(),
        }
    }
}

impl Default for AppState {
    fn default() -> Self {
        Self::new()
    }
}
