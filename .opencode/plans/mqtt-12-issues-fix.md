# MQTT Implementation: 12-Issue Fix Plan

## Status Summary
- Issues #2 and #9 are **already fixed** (verified in App.tsx)
- **10 issues remain** to be fixed

---

## Phase 1: Critical/High

### Fix #1: `dynamic_filters: false` → `true` (broker.rs:77)

**Problem**: When `dynamic_filters` is `false` in rumqttd, publishing to a topic with no existing subscription filter causes a `NoMatchingFilters` error that **forcibly disconnects** the publishing client. This breaks publish-before-subscribe scenarios.

**File**: `src-tauri/src/mqtt/broker.rs:77`

**Change**:
```rust
// BEFORE:
                    dynamic_filters: false,
// AFTER:
                    dynamic_filters: true,
```

### Fix #3: `mqttSubscribe` return type mismatch (services/mqtt.ts:50)

**Problem**: The Rust `mqtt_subscribe` command returns `Result<MqttSubscriptionInfo, AppError>` (a full object with `id`, `topic_filter`, `qos`, etc.), but the TypeScript service declares `Promise<number>`. At runtime, `subId` in `mqttSubscriptionStore.ts:60` is an object, not a number. The log message shows `[object Object]`.

**File 1**: `src/services/mqtt.ts:50-53`

**Change**:
```typescript
// BEFORE:
export const mqttSubscribe = withLogging(
  "mqtt_subscribe",
  async (connectionId: string, request: MqttSubscribeRequest): Promise<number> => {
    return invoke("mqtt_subscribe", { connectionId, request });
  }
);

// AFTER:
export const mqttSubscribe = withLogging(
  "mqtt_subscribe",
  async (connectionId: string, request: MqttSubscribeRequest): Promise<MqttSubscriptionInfo> => {
    return invoke("mqtt_subscribe", { connectionId, request });
  }
);
```

**File 2**: `src/stores/mqttSubscriptionStore.ts:55-66`

**Change**:
```typescript
// BEFORE:
  subscribe: async (connectionId, topicFilter, qos) => {
    const request: MqttSubscribeRequest = {
      topic_filter: topicFilter,
      qos: qos ?? (String(getSetting("mqttDefaultQoS")) as MqttQoS),
    };
    const subId = await mqtt.mqttSubscribe(connectionId, request);
    const subs = await mqtt.mqttGetSubscriptions(connectionId);
    set({ subscriptions: subs });
    log("info", "subscription", "mqtt_subscribe", `Subscribed to "${topicFilter}" (id=${subId})`);
    toast.success("Subscribed", topicFilter);
    return subId;
  },

// AFTER:
  subscribe: async (connectionId, topicFilter, qos) => {
    const request: MqttSubscribeRequest = {
      topic_filter: topicFilter,
      qos: qos ?? (String(getSetting("mqttDefaultQoS")) as MqttQoS),
    };
    const result = await mqtt.mqttSubscribe(connectionId, request);
    const subId = result.id;
    const subs = await mqtt.mqttGetSubscriptions(connectionId);
    set({ subscriptions: subs });
    log("info", "subscription", "mqtt_subscribe", `Subscribed to "${topicFilter}" (id=${subId})`);
    toast.success("Subscribed", topicFilter);
    return subId;
  },
```

---

## Phase 2: Moderate

### Fix #4: Implement `accept_invalid_certs` in TLS builder (client.rs)

**Problem**: The UI exposes `accept_invalid_certs`, the config carries it, but `build_tls_transport()` never reads the field. TLS always validates certificates.

**File**: `src-tauri/src/mqtt/client.rs:124-184`

**Change**: When `tls_config.accept_invalid_certs` is `true`, use the rustls `dangerous()` API to disable certificate verification. The implementation needs a custom `ServerCertVerifier`.

```rust
// Add at the top of build_tls_transport, after creating root_cert_store:

        // If accept_invalid_certs is set, build a config that skips certificate verification
        if tls_config.accept_invalid_certs {
            let tls_config_built = if let Some((certs, key)) = client_auth {
                rumqttc::tokio_rustls::rustls::ClientConfig::builder()
                    .dangerous()
                    .with_custom_certificate_verifier(Arc::new(NoVerifier))
                    .with_client_auth_cert(
                        certs.into_iter().map(|c| rumqttc::tokio_rustls::rustls::pki_types::CertificateDer::from(c.to_vec())).collect(),
                        rumqttc::tokio_rustls::rustls::pki_types::PrivateKeyDer::try_from(key.secret_der().to_vec())
                            .map_err(|e| format!("Invalid private key: {e}"))?,
                    )
                    .map_err(|e| format!("TLS client auth config error: {e}"))?
            } else {
                rumqttc::tokio_rustls::rustls::ClientConfig::builder()
                    .dangerous()
                    .with_custom_certificate_verifier(Arc::new(NoVerifier))
                    .with_no_client_auth()
            };
            return Ok(Transport::Tls(TlsConfiguration::Rustls(Arc::new(tls_config_built))));
        }
```

Also add the `NoVerifier` struct somewhere in client.rs:

```rust
/// A TLS certificate verifier that accepts any certificate.
/// Used when `accept_invalid_certs` is enabled.
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
    ) -> Result<rumqttc::tokio_rustls::rustls::client::danger::ServerCertVerified, rumqttc::tokio_rustls::rustls::Error> {
        Ok(rumqttc::tokio_rustls::rustls::client::danger::ServerCertVerified::assertion())
    }

    fn verify_tls12_signature(
        &self,
        _message: &[u8],
        _cert: &rumqttc::tokio_rustls::rustls::pki_types::CertificateDer<'_>,
        _dss: &rumqttc::tokio_rustls::rustls::DigitallySignedStruct,
    ) -> Result<rumqttc::tokio_rustls::rustls::client::danger::HandshakeSignatureValid, rumqttc::tokio_rustls::rustls::Error> {
        Ok(rumqttc::tokio_rustls::rustls::client::danger::HandshakeSignatureValid::assertion())
    }

    fn verify_tls13_signature(
        &self,
        _message: &[u8],
        _cert: &rumqttc::tokio_rustls::rustls::pki_types::CertificateDer<'_>,
        _dss: &rumqttc::tokio_rustls::rustls::DigitallySignedStruct,
    ) -> Result<rumqttc::tokio_rustls::rustls::client::danger::HandshakeSignatureValid, rumqttc::tokio_rustls::rustls::Error> {
        Ok(rumqttc::tokio_rustls::rustls::client::danger::HandshakeSignatureValid::assertion())
    }

    fn supported_verify_schemes(&self) -> Vec<rumqttc::tokio_rustls::rustls::SignatureScheme> {
        rumqttc::tokio_rustls::rustls::crypto::ring::default_provider()
            .signature_verification_algorithms
            .supported_schemes()
    }
}
```

**NOTE**: Need to verify the exact rustls API exposed by rumqttc 0.24. May need to check which rustls version is re-exported.

### Fix #5: Load system root certificates as fallback

**Problem**: If no CA cert path is provided, the `RootCertStore` is empty. Connections to brokers with certs signed by well-known CAs will fail.

**File 1**: `src-tauri/Cargo.toml` — Add dependency:
```toml
webpki-roots = "0.26"
```

**File 2**: `src-tauri/src/mqtt/client.rs:127-140` — After creating the empty root_cert_store, load webpki roots as default:

```rust
// BEFORE:
        let mut root_cert_store = rumqttc::tokio_rustls::rustls::RootCertStore::empty();

        // Load CA certificate if provided
        if let Some(ca_path) = &tls_config.ca_cert_path {
            // ... existing code ...
        }

// AFTER:
        let mut root_cert_store = rumqttc::tokio_rustls::rustls::RootCertStore::empty();

        // Load CA certificate if provided
        if let Some(ca_path) = &tls_config.ca_cert_path {
            // ... existing code unchanged ...
        } else {
            // No custom CA provided — load well-known root certificates so that
            // connections to brokers using publicly-trusted CAs work out of the box.
            root_cert_store.extend(webpki_roots::TLS_SERVER_ROOTS.iter().cloned());
        }
```

### Fix #6: Document broker stop limitation (broker.rs)

**File**: `src-tauri/src/mqtt/broker.rs:292-295`

**Change**: Add doc comment:
```rust
    /// Signal the broker to stop.
    ///
    /// **Limitation**: `rumqttd::Broker::start()` is a blocking call that runs in
    /// a detached OS thread with no built-in shutdown mechanism. Setting the
    /// `running` flag to `false` will stop the monitor and meters threads, but
    /// the broker's TCP listener and router will continue running until the
    /// process exits. The TCP port remains bound, so restarting a broker on the
    /// same port within the same process is not possible.
    pub fn stop(&self) {
```

### Fix #7: `console: None` (broker.rs:90)

**Problem**: `Some(ConsoleSettings::default())` may open an unexpected HTTP/metrics port from rumqttd's built-in console feature.

**File**: `src-tauri/src/mqtt/broker.rs:90`

**Change**:
```rust
// BEFORE:
            console: Some(ConsoleSettings::default()),
// AFTER:
            console: None,
```

### Fix #8: BrokerAdminPanel guard for connection mode

**Problem**: The component starts polling `get_broker_stats` whenever `activeConnectionId` changes, even if the connection is a client-mode connection. While the sidebar already filters the nav item, this is a defense-in-depth fix.

**File**: `src/components/mqtt/BrokerAdminPanel.tsx:46-50`

**Change**:
```tsx
// BEFORE:
  useEffect(() => {
    if (activeConnectionId) {
      startPolling(activeConnectionId);
    }
    return () => stopPolling();
  }, [activeConnectionId, startPolling, stopPolling]);

// AFTER:
  useEffect(() => {
    if (activeConnectionId && activeConnection?.mode === "broker") {
      startPolling(activeConnectionId);
    }
    return () => stopPolling();
  }, [activeConnectionId, activeConnection?.mode, startPolling, stopPolling]);
```

---

## Phase 3: Low

### Fix #10: Monitor thread comment (broker.rs:137-145)

**File**: `src-tauri/src/mqtt/broker.rs:137-145`

**Change**: Enhance the existing comment to explain the blocking recv limitation:
```rust
        // Spawn the message monitor on a dedicated OS thread since link_rx.recv()
        // is a blocking call and must not run on the tokio async runtime.
        //
        // NOTE: link_rx.recv() blocks indefinitely waiting for the next notification.
        // When the `running` flag is set to false, this thread will only exit once
        // the next notification arrives (or recv returns an error). There is no
        // try_recv or recv_timeout API available on rumqttd 0.19's LinkRx. This
        // means the monitor thread may hang until the process exits if no more
        // messages flow through the broker after stop() is called.
```

### Fix #11: Exponential backoff on subscription polling errors

**Problem**: Polls at constant interval even during repeated failures. No backoff.

**File**: `src/stores/mqttSubscriptionStore.ts`

**Changes** in the `startPolling` method:

```typescript
// Add consecutive error counter and backoff logic:

    const MAX_BACKOFF = 10000; // 10 seconds max
    let consecutiveErrors = 0;

    const schedule = (delay: number) => {
      controller.timerId = setTimeout(runPoll, delay);
    };

    const runPoll = async () => {
      if (controller.inFlight) {
        schedule(interval);
        return;
      }

      controller.inFlight = true;
      try {
        const response: MqttPollResponse = await mqtt.mqttPollMessages(controller.connectionId);
        controller.lastError = null;
        controller.lastSuccessAt = Date.now();
        consecutiveErrors = 0; // Reset on success

        if (response.messages.length > 0) {
          const { messages: existing } = get();
          let updated = [...existing, ...response.messages];
          if (updated.length > maxMessages) {
            updated = updated.slice(updated.length - maxMessages);
          }
          set({ messages: updated, pollError: null, lastPollAt: Date.now() });
        } else {
          set({ pollError: null, lastPollAt: Date.now() });
        }
      } catch (e) {
        const message = errorMessage(e);
        controller.lastError = message;
        consecutiveErrors += 1;
        set({ pollError: message });
        log("warn", "subscription", "mqtt_poll", `Poll failed: ${message}`);
      } finally {
        controller.inFlight = false;
        if (get().isPolling) {
          // Exponential backoff on consecutive errors: interval * 2^(errors-1), capped
          const backoff = consecutiveErrors > 0
            ? Math.min(interval * Math.pow(2, consecutiveErrors - 1), MAX_BACKOFF)
            : interval;
          schedule(backoff);
        }
      }
    };
```

### Fix #12: Document messages_sent approximation

**File**: `src-tauri/src/mqtt/broker.rs:219-225` — Already has a comment. Enhance it:

```rust
                            // Increment both received and sent counters.
                            // Each forwarded notification represents a message received by the broker
                            // from a publishing client AND sent by the broker to at least one subscriber.
                            // NOTE: This is an approximation. The actual fan-out count (number of
                            // subscribers who received each message) is not available through
                            // rumqttd 0.19's Forward notification. messages_sent therefore equals
                            // messages_received as a lower bound, not the true delivery count.
```

---

## Build Verification

After all changes:
1. `cargo build` in `src-tauri/` — verify Rust compiles
2. `npm run build` (or `pnpm build` / `yarn build`) — verify TypeScript compiles
3. If `webpki-roots` adds issues, check version compatibility with rumqttc 0.24's re-exported rustls

## Dependency Notes

- **webpki-roots**: Use version `0.26` which is compatible with rustls 0.23.x. Need to verify that rumqttc 0.24 re-exports rustls 0.23 (via `tokio-rustls` 0.26). If it re-exports an older version, use the matching webpki-roots version.
- The `NoVerifier` for fix #4 depends on the exact rustls `danger` API. In rustls 0.23, the trait is `ServerCertVerifier` in `rustls::client::danger`. The exact method signatures need to match the version.
