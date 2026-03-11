use std::collections::VecDeque;
use std::sync::Arc;
use std::sync::atomic::{AtomicBool, Ordering};

use rumqttc::{
    AsyncClient as V4Client, Event as V4Event, EventLoop as V4EventLoop,
    MqttOptions as V4Options, Packet as V4Packet, QoS as V4QoS,
    TlsConfiguration, Transport,
};
use rumqttc::v5::{
    AsyncClient as V5Client, Event as V5Event, EventLoop as V5EventLoop,
    MqttOptions as V5Options,
};
use rumqttc::v5::mqttbytes::v5::Packet as V5Packet;
use rumqttc::v5::mqttbytes::QoS as V5QoS;
use tokio::sync::Mutex;
use tokio::task::JoinHandle;

use crate::error::{AppError, AppResult};
use super::types::*;

/// Tracks active subscriptions so we can re-subscribe after reconnection.
type ActiveSubscriptions = Arc<Mutex<Vec<(String, MqttQoS)>>>;

/// Channel capacity for rumqttc request channel (client → event loop).
/// Must be large enough to not block when bursts of publishes arrive.
const CHANNEL_CAPACITY: usize = 10_000;

/// Max incoming messages buffered for polling.
const MAX_BUFFERED_MESSAGES: usize = 10_000;

// ─── QoS conversions ─────────────────────────────────────────────

fn to_v4_qos(qos: MqttQoS) -> V4QoS {
    match qos {
        MqttQoS::AtMostOnce => V4QoS::AtMostOnce,
        MqttQoS::AtLeastOnce => V4QoS::AtLeastOnce,
        MqttQoS::ExactlyOnce => V4QoS::ExactlyOnce,
    }
}

fn from_v4_qos(qos: V4QoS) -> MqttQoS {
    match qos {
        V4QoS::AtMostOnce => MqttQoS::AtMostOnce,
        V4QoS::AtLeastOnce => MqttQoS::AtLeastOnce,
        V4QoS::ExactlyOnce => MqttQoS::ExactlyOnce,
    }
}

fn to_v5_qos(qos: MqttQoS) -> V5QoS {
    match qos {
        MqttQoS::AtMostOnce => V5QoS::AtMostOnce,
        MqttQoS::AtLeastOnce => V5QoS::AtLeastOnce,
        MqttQoS::ExactlyOnce => V5QoS::ExactlyOnce,
    }
}

fn from_v5_qos(qos: V5QoS) -> MqttQoS {
    match qos {
        V5QoS::AtMostOnce => MqttQoS::AtMostOnce,
        V5QoS::AtLeastOnce => MqttQoS::AtLeastOnce,
        V5QoS::ExactlyOnce => MqttQoS::ExactlyOnce,
    }
}

// ─── TLS NoVerifier ──────────────────────────────────────────────

/// A TLS certificate verifier that accepts any certificate.
/// Used when `accept_invalid_certs` is enabled in the connection config.
#[derive(Debug)]
struct NoVerifier;

impl rumqttc::tokio_rustls::rustls::client::danger::ServerCertVerifier for NoVerifier {
    fn verify_server_cert(
        &self,
        _end_entity: &rumqttc::tokio_rustls::rustls::pki_types::CertificateDer<'_>,
        _intermediates: &[rumqttc::tokio_rustls::rustls::pki_types::CertificateDer<'_>],
        _server_name: &rumqttc::tokio_rustls::rustls::pki_types::ServerName<'_>,
        _ocsp_response: &[u8],
        _now: rumqttc::tokio_rustls::rustls::pki_types::UnixTime,
    ) -> Result<
        rumqttc::tokio_rustls::rustls::client::danger::ServerCertVerified,
        rumqttc::tokio_rustls::rustls::Error,
    > {
        Ok(rumqttc::tokio_rustls::rustls::client::danger::ServerCertVerified::assertion())
    }

    fn verify_tls12_signature(
        &self,
        _message: &[u8],
        _cert: &rumqttc::tokio_rustls::rustls::pki_types::CertificateDer<'_>,
        _dss: &rumqttc::tokio_rustls::rustls::DigitallySignedStruct,
    ) -> Result<
        rumqttc::tokio_rustls::rustls::client::danger::HandshakeSignatureValid,
        rumqttc::tokio_rustls::rustls::Error,
    > {
        Ok(rumqttc::tokio_rustls::rustls::client::danger::HandshakeSignatureValid::assertion())
    }

    fn verify_tls13_signature(
        &self,
        _message: &[u8],
        _cert: &rumqttc::tokio_rustls::rustls::pki_types::CertificateDer<'_>,
        _dss: &rumqttc::tokio_rustls::rustls::DigitallySignedStruct,
    ) -> Result<
        rumqttc::tokio_rustls::rustls::client::danger::HandshakeSignatureValid,
        rumqttc::tokio_rustls::rustls::Error,
    > {
        Ok(rumqttc::tokio_rustls::rustls::client::danger::HandshakeSignatureValid::assertion())
    }

    fn supported_verify_schemes(&self) -> Vec<rumqttc::tokio_rustls::rustls::SignatureScheme> {
        rumqttc::tokio_rustls::rustls::crypto::ring::default_provider()
            .signature_verification_algorithms
            .supported_schemes()
    }
}

// ─── Protocol Abstraction ────────────────────────────────────────

/// Wraps either a v4 or v5 MQTT client.
enum ClientProtocol {
    V4(V4Client),
    V5(V5Client),
}

/// Shared buffer for incoming messages.
type MessageBuffer = Arc<Mutex<VecDeque<MqttMessage>>>;

/// Shared storage for the last connection error so the connect method can
/// surface the real error instead of a generic timeout message.
type LastError = Arc<Mutex<Option<String>>>;

// ─── MqttClientConnection ────────────────────────────────────────

pub struct MqttClientConnection {
    client: ClientProtocol,
    buffer: MessageBuffer,
    connected: Arc<AtomicBool>,
    event_loop_handle: Option<JoinHandle<()>>,
    next_msg_id: Arc<std::sync::atomic::AtomicU64>,
    active_subscriptions: ActiveSubscriptions,
}

impl MqttClientConnection {
    pub async fn connect(config: &MqttConnectionConfig) -> AppResult<Self> {
        let client_id = config.client_id.clone().unwrap_or_else(|| {
            format!(
                "iotui-{}",
                uuid::Uuid::new_v4()
                    .to_string()
                    .split('-')
                    .next()
                    .unwrap_or("client")
            )
        });

        let buffer: MessageBuffer =
            Arc::new(Mutex::new(VecDeque::with_capacity(MAX_BUFFERED_MESSAGES)));
        let connected = Arc::new(AtomicBool::new(false));
        let next_msg_id = Arc::new(std::sync::atomic::AtomicU64::new(1));
        let last_error: LastError = Arc::new(Mutex::new(None));
        let active_subscriptions: ActiveSubscriptions = Arc::new(Mutex::new(Vec::new()));

        let (client, handle) = match config.protocol_version {
            MqttProtocolVersion::V311 => {
                Self::connect_v4(config, &client_id, &buffer, &connected, &next_msg_id, &last_error, &active_subscriptions).await?
            }
            MqttProtocolVersion::V5 => {
                Self::connect_v5(config, &client_id, &buffer, &connected, &next_msg_id, &last_error, &active_subscriptions).await?
            }
        };

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
            match &client {
                ClientProtocol::V4(c) => { let _ = c.disconnect().await; }
                ClientProtocol::V5(c) => { let _ = c.disconnect().await; }
            }

            // Include the real error if the event loop captured one
            let real_error = last_error.lock().await.take();
            let detail = match real_error {
                Some(err) => format!(
                    "Connection to {}:{} failed: {}",
                    config.host, config.port, err
                ),
                None => format!(
                    "Connection to {}:{} timed out after 5 seconds",
                    config.host, config.port
                ),
            };
            return Err(AppError::mqtt(detail));
        }

        let version_label = match config.protocol_version {
            MqttProtocolVersion::V311 => "v3.1.1",
            MqttProtocolVersion::V5 => "v5",
        };
        log::info!(
            "MQTT {} client connected to {}:{} as {}",
            version_label, config.host, config.port, client_id
        );

        Ok(Self {
            client,
            buffer,
            connected,
            event_loop_handle: Some(handle),
            next_msg_id,
            active_subscriptions,
        })
    }

    // ─── V4 (MQTT 3.1.1) connect path ───────────────────────────

    async fn connect_v4(
        config: &MqttConnectionConfig,
        client_id: &str,
        buffer: &MessageBuffer,
        connected: &Arc<AtomicBool>,
        next_msg_id: &Arc<std::sync::atomic::AtomicU64>,
        last_error: &LastError,
        active_subscriptions: &ActiveSubscriptions,
    ) -> AppResult<(ClientProtocol, JoinHandle<()>)> {
        let mut opts = V4Options::new(client_id, &config.host, config.port);

        opts.set_keep_alive(std::time::Duration::from_secs(
            config.keep_alive_secs.unwrap_or(30) as u64,
        ));
        opts.set_clean_session(config.clean_session);

        if let (Some(username), Some(password)) = (&config.username, &config.password) {
            opts.set_credentials(username.clone(), password.clone());
        }

        if let Some(lw) = &config.last_will {
            opts.set_last_will(rumqttc::LastWill::new(
                &lw.topic,
                lw.payload.as_bytes().to_vec(),
                to_v4_qos(lw.qos),
                lw.retain,
            ));
        }

        if let Some(tls_config) = &config.tls {
            let transport = Self::build_tls_transport(tls_config)
                .map_err(|e| AppError::mqtt(format!("TLS configuration error: {e}")))?;
            opts.set_transport(transport);
        }

        let (client, eventloop) = V4Client::new(opts, CHANNEL_CAPACITY);
        let resubscribe_client = client.clone();
        let handle = Self::spawn_v4_event_loop(
            eventloop,
            buffer.clone(),
            connected.clone(),
            next_msg_id.clone(),
            last_error.clone(),
            resubscribe_client,
            active_subscriptions.clone(),
        );
        Ok((ClientProtocol::V4(client), handle))
    }

    // ─── V5 (MQTT 5.0) connect path ─────────────────────────────

    async fn connect_v5(
        config: &MqttConnectionConfig,
        client_id: &str,
        buffer: &MessageBuffer,
        connected: &Arc<AtomicBool>,
        next_msg_id: &Arc<std::sync::atomic::AtomicU64>,
        last_error: &LastError,
        active_subscriptions: &ActiveSubscriptions,
    ) -> AppResult<(ClientProtocol, JoinHandle<()>)> {
        let mut opts = V5Options::new(client_id, &config.host, config.port);

        opts.set_keep_alive(std::time::Duration::from_secs(
            config.keep_alive_secs.unwrap_or(30) as u64,
        ));
        opts.set_clean_start(config.clean_session);

        if let (Some(username), Some(password)) = (&config.username, &config.password) {
            opts.set_credentials(username.clone(), password.clone());
        }

        if let Some(lw) = &config.last_will {
            opts.set_last_will(rumqttc::v5::mqttbytes::v5::LastWill::new(
                &lw.topic,
                lw.payload.as_bytes().to_vec(),
                to_v5_qos(lw.qos),
                lw.retain,
                None, // no v5-specific will properties
            ));
        }

        if let Some(tls_config) = &config.tls {
            let transport = Self::build_tls_transport(tls_config)
                .map_err(|e| AppError::mqtt(format!("TLS configuration error: {e}")))?;
            opts.set_transport(transport);
        }

        let (client, eventloop) = V5Client::new(opts, CHANNEL_CAPACITY);
        let resubscribe_client = client.clone();
        let handle = Self::spawn_v5_event_loop(
            eventloop,
            buffer.clone(),
            connected.clone(),
            next_msg_id.clone(),
            last_error.clone(),
            resubscribe_client,
            active_subscriptions.clone(),
        );
        Ok((ClientProtocol::V5(client), handle))
    }

    // ─── TLS ─────────────────────────────────────────────────────

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
                root_cert_store
                    .add(cert)
                    .map_err(|e| format!("Failed to add CA cert: {e}"))?;
            }
        } else {
            root_cert_store.extend(webpki_roots::TLS_SERVER_ROOTS.iter().cloned());
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

        if tls_config.accept_invalid_certs {
            log::warn!(
                "TLS: accept_invalid_certs is enabled — certificate verification is DISABLED"
            );
            let tls_client_config = if let Some((certs, key)) = client_auth {
                rumqttc::tokio_rustls::rustls::ClientConfig::builder()
                    .dangerous()
                    .with_custom_certificate_verifier(Arc::new(NoVerifier))
                    .with_client_auth_cert(
                        certs
                            .into_iter()
                            .map(|c| {
                                rumqttc::tokio_rustls::rustls::pki_types::CertificateDer::from(
                                    c.to_vec(),
                                )
                            })
                            .collect(),
                        rumqttc::tokio_rustls::rustls::pki_types::PrivateKeyDer::try_from(
                            key.secret_der().to_vec(),
                        )
                        .map_err(|e| format!("Invalid private key: {e}"))?,
                    )
                    .map_err(|e| format!("TLS client auth config error: {e}"))?
            } else {
                rumqttc::tokio_rustls::rustls::ClientConfig::builder()
                    .dangerous()
                    .with_custom_certificate_verifier(Arc::new(NoVerifier))
                    .with_no_client_auth()
            };
            return Ok(Transport::Tls(TlsConfiguration::Rustls(Arc::new(
                tls_client_config,
            ))));
        }

        let tls_config = if let Some((certs, key)) = client_auth {
            TlsConfiguration::Rustls(Arc::new(
                rumqttc::tokio_rustls::rustls::ClientConfig::builder()
                    .with_root_certificates(root_cert_store)
                    .with_client_auth_cert(
                        certs
                            .into_iter()
                            .map(|c| {
                                rumqttc::tokio_rustls::rustls::pki_types::CertificateDer::from(
                                    c.to_vec(),
                                )
                            })
                            .collect(),
                        rumqttc::tokio_rustls::rustls::pki_types::PrivateKeyDer::try_from(
                            key.secret_der().to_vec(),
                        )
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

    // ─── Event loops ─────────────────────────────────────────────

    fn spawn_v4_event_loop(
        mut eventloop: V4EventLoop,
        buffer: MessageBuffer,
        connected: Arc<AtomicBool>,
        next_msg_id: Arc<std::sync::atomic::AtomicU64>,
        last_error: LastError,
        resubscribe_client: V4Client,
        active_subscriptions: ActiveSubscriptions,
    ) -> JoinHandle<()> {
        tokio::spawn(async move {
            // Track whether we have ever been connected so we can distinguish
            // the initial ConnAck from a reconnection ConnAck.
            let mut has_been_connected = false;
            let mut msg_count: u64 = 0;
            let mut last_log_at = tokio::time::Instant::now();

            loop {
                match eventloop.poll().await {
                    Ok(event) => match &event {
                        V4Event::Incoming(V4Packet::ConnAck(_)) => {
                            let is_reconnect = has_been_connected;
                            has_been_connected = true;
                            connected.store(true, Ordering::Relaxed);

                            if is_reconnect {
                                log::info!("MQTT v4: Reconnected — re-subscribing to tracked topics");
                                let subs = active_subscriptions.lock().await.clone();
                                for (topic, qos) in &subs {
                                    if let Err(e) = resubscribe_client
                                        .subscribe(topic, to_v4_qos(*qos))
                                        .await
                                    {
                                        log::error!(
                                            "MQTT v4: Failed to re-subscribe to {}: {e}",
                                            topic
                                        );
                                    } else {
                                        log::info!("MQTT v4: Re-subscribed to {}", topic);
                                    }
                                }
                            } else {
                                log::info!("MQTT v4: ConnAck received (initial)");
                            }
                        }
                        V4Event::Incoming(V4Packet::Publish(publish)) => {
                            msg_count += 1;
                            // Log a progress message every 30 seconds so we can
                            // tell if the event loop is alive and receiving data.
                            let now = tokio::time::Instant::now();
                            if now.duration_since(last_log_at) >= std::time::Duration::from_secs(30) {
                                log::info!(
                                    "MQTT v4: Event loop alive — {} messages received so far",
                                    msg_count
                                );
                                last_log_at = now;
                            }

                            let payload_bytes = publish.payload.to_vec();
                            let payload_str =
                                String::from_utf8_lossy(&payload_bytes).to_string();
                            let format = detect_payload_format(&payload_str);
                            let msg_id = next_msg_id.fetch_add(1, Ordering::Relaxed);

                            let msg = MqttMessage {
                                id: format!("recv-{msg_id}"),
                                topic: publish.topic.clone(),
                                payload: payload_str,
                                payload_format: format,
                                qos: from_v4_qos(publish.qos),
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
                        V4Event::Incoming(V4Packet::Disconnect) => {
                            connected.store(false, Ordering::Relaxed);
                            log::warn!("MQTT v4: Server sent Disconnect");
                        }
                        _ => {}
                    },
                    Err(e) => {
                        let was_connected = connected.swap(false, Ordering::Relaxed);
                        // Always log event loop errors (not just when previously connected)
                        log::warn!("MQTT v4 event loop error (connected={}): {e}", was_connected);
                        // Store the error so the connect method can surface it
                        let mut err = last_error.lock().await;
                        *err = Some(e.to_string());
                        tokio::time::sleep(std::time::Duration::from_secs(1)).await;
                    }
                }
            }
        })
    }

    fn spawn_v5_event_loop(
        mut eventloop: V5EventLoop,
        buffer: MessageBuffer,
        connected: Arc<AtomicBool>,
        next_msg_id: Arc<std::sync::atomic::AtomicU64>,
        last_error: LastError,
        resubscribe_client: V5Client,
        active_subscriptions: ActiveSubscriptions,
    ) -> JoinHandle<()> {
        tokio::spawn(async move {
            let mut has_been_connected = false;
            let mut msg_count: u64 = 0;
            let mut last_log_at = tokio::time::Instant::now();

            loop {
                match eventloop.poll().await {
                    Ok(event) => match &event {
                        V5Event::Incoming(V5Packet::ConnAck(_)) => {
                            let is_reconnect = has_been_connected;
                            has_been_connected = true;
                            connected.store(true, Ordering::Relaxed);

                            if is_reconnect {
                                log::info!("MQTT v5: Reconnected — re-subscribing to tracked topics");
                                let subs = active_subscriptions.lock().await.clone();
                                for (topic, qos) in &subs {
                                    if let Err(e) = resubscribe_client
                                        .subscribe(topic, to_v5_qos(*qos))
                                        .await
                                    {
                                        log::error!(
                                            "MQTT v5: Failed to re-subscribe to {}: {e}",
                                            topic
                                        );
                                    } else {
                                        log::info!("MQTT v5: Re-subscribed to {}", topic);
                                    }
                                }
                            } else {
                                log::info!("MQTT v5: ConnAck received (initial)");
                            }
                        }
                        V5Event::Incoming(V5Packet::Publish(publish)) => {
                            msg_count += 1;
                            let now = tokio::time::Instant::now();
                            if now.duration_since(last_log_at) >= std::time::Duration::from_secs(30) {
                                log::info!(
                                    "MQTT v5: Event loop alive — {} messages received so far",
                                    msg_count
                                );
                                last_log_at = now;
                            }

                            let payload_bytes = publish.payload.to_vec();
                            let payload_str =
                                String::from_utf8_lossy(&payload_bytes).to_string();
                            let topic =
                                String::from_utf8_lossy(&publish.topic).to_string();
                            let format = detect_payload_format(&payload_str);
                            let msg_id = next_msg_id.fetch_add(1, Ordering::Relaxed);

                            let msg = MqttMessage {
                                id: format!("recv-{msg_id}"),
                                topic,
                                payload: payload_str,
                                payload_format: format,
                                qos: from_v5_qos(publish.qos),
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
                        V5Event::Incoming(V5Packet::Disconnect(_)) => {
                            connected.store(false, Ordering::Relaxed);
                            log::warn!("MQTT v5: Server sent Disconnect");
                        }
                        _ => {}
                    },
                    Err(e) => {
                        let was_connected = connected.swap(false, Ordering::Relaxed);
                        log::warn!("MQTT v5 event loop error (connected={}): {e}", was_connected);
                        let mut err = last_error.lock().await;
                        *err = Some(e.to_string());
                        tokio::time::sleep(std::time::Duration::from_secs(1)).await;
                    }
                }
            }
        })
    }

    // ─── Public API ──────────────────────────────────────────────

    pub async fn subscribe(&self, topic: &str, qos: MqttQoS) -> AppResult<()> {
        match &self.client {
            ClientProtocol::V4(c) => {
                c.subscribe(topic, to_v4_qos(qos))
                    .await
                    .map_err(|e| AppError::mqtt(format!("Subscribe failed: {e}")))?;
            }
            ClientProtocol::V5(c) => {
                c.subscribe(topic, to_v5_qos(qos))
                    .await
                    .map_err(|e| AppError::mqtt(format!("Subscribe failed: {e}")))?;
            }
        }
        // Track the subscription so we can re-subscribe on reconnection
        {
            let mut subs = self.active_subscriptions.lock().await;
            // Replace if the same topic already exists (e.g. QoS change)
            subs.retain(|(t, _)| t != topic);
            subs.push((topic.to_string(), qos));
        }
        Ok(())
    }

    pub async fn unsubscribe(&self, topic: &str) -> AppResult<()> {
        match &self.client {
            ClientProtocol::V4(c) => {
                c.unsubscribe(topic)
                    .await
                    .map_err(|e| AppError::mqtt(format!("Unsubscribe failed: {e}")))?;
            }
            ClientProtocol::V5(c) => {
                c.unsubscribe(topic)
                    .await
                    .map_err(|e| AppError::mqtt(format!("Unsubscribe failed: {e}")))?;
            }
        }
        // Remove from tracker
        {
            let mut subs = self.active_subscriptions.lock().await;
            subs.retain(|(t, _)| t != topic);
        }
        Ok(())
    }

    pub async fn publish(
        &self,
        topic: &str,
        payload: &[u8],
        qos: MqttQoS,
        retain: bool,
    ) -> AppResult<()> {
        match &self.client {
            ClientProtocol::V4(c) => {
                c.publish(topic, to_v4_qos(qos), retain, payload)
                    .await
                    .map_err(|e| AppError::mqtt(format!("Publish failed: {e}")))?;
            }
            ClientProtocol::V5(c) => {
                c.publish(topic, to_v5_qos(qos), retain, payload.to_vec())
                    .await
                    .map_err(|e| AppError::mqtt(format!("Publish failed: {e}")))?;
            }
        }
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
        match &self.client {
            ClientProtocol::V4(c) => {
                c.disconnect()
                    .await
                    .map_err(|e| AppError::mqtt(format!("Disconnect failed: {e}")))?;
            }
            ClientProtocol::V5(c) => {
                c.disconnect()
                    .await
                    .map_err(|e| AppError::mqtt(format!("Disconnect failed: {e}")))?;
            }
        }
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
