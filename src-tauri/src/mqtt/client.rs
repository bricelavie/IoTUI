use std::collections::VecDeque;
use std::sync::Arc;
use std::sync::atomic::{AtomicBool, Ordering};

use rumqttc::{AsyncClient, Event, EventLoop, MqttOptions, Packet, QoS, TlsConfiguration, Transport};
use tokio::sync::Mutex;
use tokio::task::JoinHandle;

use crate::error::{AppError, AppResult};
use super::types::*;
use super::simulator::detect_payload_format;

/// Max incoming messages buffered for polling.
const MAX_BUFFERED_MESSAGES: usize = 10_000;

/// Convert our QoS enum to rumqttc QoS.
fn to_rumqttc_qos(qos: MqttQoS) -> QoS {
    match qos {
        MqttQoS::AtMostOnce => QoS::AtMostOnce,
        MqttQoS::AtLeastOnce => QoS::AtLeastOnce,
        MqttQoS::ExactlyOnce => QoS::ExactlyOnce,
    }
}

fn from_rumqttc_qos(qos: QoS) -> MqttQoS {
    match qos {
        QoS::AtMostOnce => MqttQoS::AtMostOnce,
        QoS::AtLeastOnce => MqttQoS::AtLeastOnce,
        QoS::ExactlyOnce => MqttQoS::ExactlyOnce,
    }
}

/// Shared buffer for incoming messages.
type MessageBuffer = Arc<Mutex<VecDeque<MqttMessage>>>;

pub struct MqttClientConnection {
    client: AsyncClient,
    buffer: MessageBuffer,
    connected: Arc<AtomicBool>,
    event_loop_handle: Option<JoinHandle<()>>,
    next_msg_id: Arc<std::sync::atomic::AtomicU64>,
}

impl MqttClientConnection {
    pub async fn connect(config: &MqttConnectionConfig) -> AppResult<Self> {
        let client_id = config.client_id.clone().unwrap_or_else(|| {
            format!("iotui-{}", uuid::Uuid::new_v4().to_string().split('-').next().unwrap_or("client"))
        });

        let mut mqttoptions = MqttOptions::new(
            &client_id,
            &config.host,
            config.port,
        );

        mqttoptions.set_keep_alive(std::time::Duration::from_secs(
            config.keep_alive_secs.unwrap_or(30) as u64,
        ));
        mqttoptions.set_clean_session(config.clean_session);

        // Authentication
        if let (Some(username), Some(password)) = (&config.username, &config.password) {
            mqttoptions.set_credentials(username.clone(), password.clone());
        }

        // Last Will
        if let Some(lw) = &config.last_will {
            mqttoptions.set_last_will(rumqttc::LastWill::new(
                &lw.topic,
                lw.payload.as_bytes().to_vec(),
                to_rumqttc_qos(lw.qos),
                lw.retain,
            ));
        }

        // TLS configuration
        if let Some(tls_config) = &config.tls {
            let transport = Self::build_tls_transport(tls_config).map_err(|e| {
                AppError::mqtt(format!("TLS configuration error: {e}"))
            })?;
            mqttoptions.set_transport(transport);
        }

        let (client, eventloop) = AsyncClient::new(mqttoptions, 100);
        let buffer: MessageBuffer = Arc::new(Mutex::new(VecDeque::with_capacity(MAX_BUFFERED_MESSAGES)));
        let connected = Arc::new(AtomicBool::new(false));
        let next_msg_id = Arc::new(std::sync::atomic::AtomicU64::new(1));

        let handle = Self::spawn_event_loop(
            eventloop,
            buffer.clone(),
            connected.clone(),
            next_msg_id.clone(),
        );

        // Wait briefly for the connection to establish
        let deadline = tokio::time::Instant::now() + std::time::Duration::from_secs(5);
        while tokio::time::Instant::now() < deadline {
            if connected.load(Ordering::Relaxed) {
                break;
            }
            tokio::time::sleep(std::time::Duration::from_millis(50)).await;
        }

        if !connected.load(Ordering::Relaxed) {
            // Try to clean up
            let _ = client.disconnect().await;
            return Err(AppError::mqtt(format!(
                "Connection to {}:{} timed out after 5 seconds",
                config.host, config.port
            )));
        }

        log::info!("MQTT client connected to {}:{} as {}", config.host, config.port, client_id);

        Ok(Self {
            client,
            buffer,
            connected,
            event_loop_handle: Some(handle),
            next_msg_id,
        })
    }

    fn build_tls_transport(tls_config: &MqttTlsConfig) -> Result<Transport, String> {
        use std::io::BufReader;

        let mut root_cert_store = rumqttc::tokio_rustls::rustls::RootCertStore::empty();

        // Load CA certificate if provided
        if let Some(ca_path) = &tls_config.ca_cert_path {
            let ca_file = std::fs::File::open(ca_path)
                .map_err(|e| format!("Failed to open CA cert: {e}"))?;
            let mut reader = BufReader::new(ca_file);
            let certs = rustls_pemfile::certs(&mut reader)
                .collect::<Result<Vec<_>, _>>()
                .map_err(|e| format!("Failed to parse CA cert: {e}"))?;
            for cert in certs {
                root_cert_store.add(cert).map_err(|e| format!("Failed to add CA cert: {e}"))?;
            }
        }

        // Load client certificate and key if provided
        let client_auth = if let (Some(cert_path), Some(key_path)) =
            (&tls_config.client_cert_path, &tls_config.client_key_path)
        {
            let cert_file = std::fs::File::open(cert_path)
                .map_err(|e| format!("Failed to open client cert: {e}"))?;
            let mut cert_reader = BufReader::new(cert_file);
            let certs = rustls_pemfile::certs(&mut cert_reader)
                .collect::<Result<Vec<_>, _>>()
                .map_err(|e| format!("Failed to parse client cert: {e}"))?;

            let key_file = std::fs::File::open(key_path)
                .map_err(|e| format!("Failed to open client key: {e}"))?;
            let mut key_reader = BufReader::new(key_file);
            let key = rustls_pemfile::private_key(&mut key_reader)
                .map_err(|e| format!("Failed to parse client key: {e}"))?
                .ok_or_else(|| "No private key found in key file".to_string())?;

            Some((certs, key))
        } else {
            None
        };

        let tls_config = if let Some((certs, key)) = client_auth {
            TlsConfiguration::Rustls(Arc::new(
                rumqttc::tokio_rustls::rustls::ClientConfig::builder()
                    .with_root_certificates(root_cert_store)
                    .with_client_auth_cert(
                        certs.into_iter().map(|c| rumqttc::tokio_rustls::rustls::pki_types::CertificateDer::from(c.to_vec())).collect(),
                        rumqttc::tokio_rustls::rustls::pki_types::PrivateKeyDer::try_from(key.secret_der().to_vec())
                            .map_err(|e| format!("Invalid private key: {e}"))?,
                    )
                    .map_err(|e| format!("TLS client auth config error: {e}"))?,
            ))
        } else {
            TlsConfiguration::Rustls(Arc::new(
                rumqttc::tokio_rustls::rustls::ClientConfig::builder()
                    .with_root_certificates(root_cert_store)
                    .with_no_client_auth(),
            ))
        };

        Ok(Transport::Tls(tls_config))
    }

    fn spawn_event_loop(
        mut eventloop: EventLoop,
        buffer: MessageBuffer,
        connected: Arc<AtomicBool>,
        next_msg_id: Arc<std::sync::atomic::AtomicU64>,
    ) -> JoinHandle<()> {
        tokio::spawn(async move {
            loop {
                match eventloop.poll().await {
                    Ok(event) => {
                        match &event {
                            Event::Incoming(Packet::ConnAck(_)) => {
                                connected.store(true, Ordering::Relaxed);
                                log::info!("MQTT: ConnAck received");
                            }
                            Event::Incoming(Packet::Publish(publish)) => {
                                let payload_bytes = publish.payload.to_vec();
                                let payload_str = String::from_utf8_lossy(&payload_bytes).to_string();
                                let format = detect_payload_format(&payload_str);
                                let msg_id = next_msg_id.fetch_add(1, Ordering::Relaxed);

                                let msg = MqttMessage {
                                    id: format!("recv-{msg_id}"),
                                    topic: publish.topic.clone(),
                                    payload: payload_str,
                                    payload_format: format,
                                    qos: from_rumqttc_qos(publish.qos),
                                    retain: publish.retain,
                                    timestamp: chrono::Utc::now()
                                        .format("%Y-%m-%dT%H:%M:%S%.3fZ")
                                        .to_string(),
                                    payload_size_bytes: payload_bytes.len(),
                                };

                                let mut buf = buffer.lock().await;
                                if buf.len() >= MAX_BUFFERED_MESSAGES {
                                    buf.pop_front();
                                }
                                buf.push_back(msg);
                            }
                            Event::Incoming(Packet::Disconnect) => {
                                connected.store(false, Ordering::Relaxed);
                                log::warn!("MQTT: Server sent Disconnect");
                            }
                            _ => {}
                        }
                    }
                    Err(e) => {
                        let was_connected = connected.swap(false, Ordering::Relaxed);
                        if was_connected {
                            log::warn!("MQTT event loop error (will retry): {e}");
                        }
                        // rumqttc automatically reconnects, give it time
                        tokio::time::sleep(std::time::Duration::from_secs(1)).await;
                    }
                }
            }
        })
    }

    pub async fn subscribe(&self, topic: &str, qos: MqttQoS) -> AppResult<()> {
        self.client
            .subscribe(topic, to_rumqttc_qos(qos))
            .await
            .map_err(|e| AppError::mqtt(format!("Subscribe failed: {e}")))?;
        Ok(())
    }

    pub async fn unsubscribe(&self, topic: &str) -> AppResult<()> {
        self.client
            .unsubscribe(topic)
            .await
            .map_err(|e| AppError::mqtt(format!("Unsubscribe failed: {e}")))?;
        Ok(())
    }

    pub async fn publish(
        &self,
        topic: &str,
        payload: &[u8],
        qos: MqttQoS,
        retain: bool,
    ) -> AppResult<()> {
        self.client
            .publish(topic, to_rumqttc_qos(qos), retain, payload)
            .await
            .map_err(|e| AppError::mqtt(format!("Publish failed: {e}")))?;
        Ok(())
    }

    pub async fn poll_messages(&self) -> Vec<MqttMessage> {
        let mut buf = self.buffer.lock().await;
        buf.drain(..).collect()
    }

    pub fn is_connected(&self) -> bool {
        self.connected.load(Ordering::Relaxed)
    }

    pub async fn disconnect(&self) -> AppResult<()> {
        self.connected.store(false, Ordering::Relaxed);
        self.client
            .disconnect()
            .await
            .map_err(|e| AppError::mqtt(format!("Disconnect failed: {e}")))?;
        Ok(())
    }
}

impl Drop for MqttClientConnection {
    fn drop(&mut self) {
        if let Some(handle) = self.event_loop_handle.take() {
            handle.abort();
        }
    }
}
