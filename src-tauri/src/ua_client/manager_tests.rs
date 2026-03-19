#[cfg(test)]
mod tests {
    use crate::ua_client::UaClientManager;
    use crate::ua_client::types::{AuthType, ConnectionConfig, CreateSubscriptionRequest, MonitoredItemRequest};

    fn simulator_config() -> ConnectionConfig {
        ConnectionConfig {
            name: "Simulator".to_string(),
            endpoint_url: "opc.tcp://simulator:4840".to_string(),
            security_policy: "None".to_string(),
            security_mode: "None".to_string(),
            auth_type: AuthType::Anonymous,
            username: None,
            password: None,
            session_timeout: Some(60_000),
            trust_server_certs: false,
            certificate_path: None,
            private_key_path: None,
            use_simulator: true,
        }
    }

    #[tokio::test]
    async fn simulator_subscription_round_trip() {
        let manager = UaClientManager::new();
        let connection_id = manager.connect(simulator_config()).await.unwrap();

        let sub = manager
            .create_subscription(
                &connection_id,
                &CreateSubscriptionRequest {
                    publishing_interval: 500.0,
                    lifetime_count: 60,
                    max_keep_alive_count: 10,
                    max_notifications_per_publish: 0,
                    priority: 0,
                    publishing_enabled: true,
                },
            )
            .await
            .unwrap();

        manager
            .add_monitored_items(
                &connection_id,
                sub.subscription_id,
                &[MonitoredItemRequest {
                    node_id: "ns=2;s=Line1.Robot1.Temp".to_string(),
                    display_name: Some("Robot Temp".to_string()),
                    sampling_interval: 500.0,
                    queue_size: 10,
                    discard_oldest: true,
                }],
            )
            .await
            .unwrap();

        let subscriptions = manager.get_subscriptions(&connection_id).await.unwrap();
        assert_eq!(subscriptions.len(), 1);
        assert_eq!(subscriptions[0].monitored_items.len(), 1);

        let events = manager
            .poll_subscription(&connection_id, sub.subscription_id)
            .await
            .unwrap();
        assert_eq!(events.len(), 1);
        assert_eq!(events[0].subscription_id, sub.subscription_id);
    }

    #[tokio::test]
    async fn simulator_status_reports_connected() {
        let manager = UaClientManager::new();
        let connection_id = manager.connect(simulator_config()).await.unwrap();
        let status = manager.get_status(&connection_id).await.unwrap();
        assert_eq!(status, crate::ua_client::types::ConnectionStatus::Connected);
    }

    #[tokio::test]
    async fn simulator_history_returns_samples() {
        let manager = UaClientManager::new();
        let connection_id = manager.connect(simulator_config()).await.unwrap();
        let result = manager
            .read_history(
                &connection_id,
                &crate::ua_client::types::HistoryReadRequest {
                    node_id: "ns=2;s=Line1.Robot1.Temp".to_string(),
                    start_time: None,
                    end_time: None,
                    max_values: Some(10),
                    continuation_point: None,
                },
            )
            .await
            .unwrap();
        assert_eq!(result.node_id, "ns=2;s=Line1.Robot1.Temp");
        assert_eq!(result.values.len(), 10);
    }

    #[tokio::test]
    async fn simulator_monitored_item_ids_are_logical() {
        let manager = UaClientManager::new();
        let connection_id = manager.connect(simulator_config()).await.unwrap();

        let sub = manager
            .create_subscription(
                &connection_id,
                &CreateSubscriptionRequest {
                    publishing_interval: 500.0,
                    lifetime_count: 60,
                    max_keep_alive_count: 10,
                    max_notifications_per_publish: 0,
                    priority: 0,
                    publishing_enabled: true,
                },
            )
            .await
            .unwrap();

        let ids = manager
            .add_monitored_items(
                &connection_id,
                sub.subscription_id,
                &[MonitoredItemRequest {
                    node_id: "ns=2;s=Line1.Robot1.Temp".to_string(),
                    display_name: Some("Robot Temp".to_string()),
                    sampling_interval: 500.0,
                    queue_size: 10,
                    discard_oldest: true,
                }],
            )
            .await
            .unwrap();

        let subscriptions = manager.get_subscriptions(&connection_id).await.unwrap();
        assert_eq!(subscriptions[0].monitored_items[0].id, ids[0]);
    }
}
