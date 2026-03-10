# OPC UA Implementation: 9-Issue Fix Plan

## Status Summary
- Issue #8 (`inferMethodParent` duplicated) was **already fixed** — the duplicate no longer exists
- **9 issues remain** to be fixed

---

## Phase 1: Critical/High

### Fix #1: Event subscription not tracked — cannot be managed or deleted

**Problem**: `subscribe_to_events()` (line 1321) creates a subscription and monitored item via the SDK but **never stores** the subscription ID. The `sub_id` returned from `create_subscription()` at line 1392 is logged but discarded. This means:
- The event subscription cannot be deleted when disconnecting (resource leak on the server side)
- On reconnect, the SDK's `recreate_subscriptions(true)` recreates it, but it's invisible to our bookkeeping
- If event subscription creation fails silently, there's no way to retry

**Files**: `src-tauri/src/ua_client/client.rs`

**Change**: Store the event subscription ID in a new field `event_subscription_id: Option<u32>` on `OpcUaConnection`. On `disconnect()`, delete the event subscription before calling `session.disconnect()`. This is a defensive cleanup — while the server should clean up on session close, explicitly deleting prevents accumulation if the server doesn't clean up properly.

```rust
// In OpcUaConnection struct (line 68):
// ADD:
    event_subscription_id: Option<u32>,

// In connect() (line 397):
// ADD field:
    event_subscription_id: None,

// In subscribe_to_events() (line 1457), after logging:
    self.event_subscription_id = Some(sub_id);

// BUT: subscribe_to_events takes &self, not &mut self.
// We need to change the approach: store it in an Arc<SyncMutex<Option<u32>>>
// OR change connect() to call it on &mut self (it already does: line 412).
```

Wait — `subscribe_to_events()` takes `&self` (line 1323), not `&mut self`. But it's called from `connect()` which constructs `conn` and then calls `conn.subscribe_to_events()`. We'd need to either:
- (a) Make `event_subscription_id` an `Arc<SyncMutex<Option<u32>>>` so we can set it from `&self`, OR
- (b) Change `subscribe_to_events()` to return the `sub_id` and store it in `connect()` after the call

**Recommended approach: (b)** — Change `subscribe_to_events()` to return `AppResult<u32>` (the subscription id), then store it in `connect()`:

```rust
// client.rs struct field (line ~79):
    event_subscription_id: Option<u32>,

// subscribe_to_events signature change:
    pub async fn subscribe_to_events(&self) -> AppResult<u32> {
        // ... existing code ...
        // At end (replacing Ok(())):
        Ok(sub_id)
    }

// connect() (line 411-415):
    let event_sub_id = match conn.subscribe_to_events().await {
        Ok(id) => {
            info!("Auto-subscribed to server events (sub_id={})", id);
            Some(id)
        }
        Err(e) => {
            log::warn!("Failed to auto-subscribe to events: {e}");
            None
        }
    };
    conn.event_subscription_id = event_sub_id;

// disconnect() (line 421-431): delete event subscription before disconnect
    pub async fn disconnect(&self) -> AppResult<()> {
        info!("Disconnecting from OPC UA server");
        // Best-effort cleanup of event subscription
        if let Some(sub_id) = self.event_subscription_id {
            let _ = self.session.delete_subscription(sub_id).await;
        }
        // ... rest unchanged ...
    }
```

---

### Fix #2: `NodeAttribute.data_type` always hard-coded to `"String"` (line 688)

**Problem**: In `read_node_details()`, the attributes list is built with `data_type: Some("String".to_string())` for every attribute, regardless of what the attribute actually is. The `NodeDetails.data_type` field (line 614-619) is correctly resolved using `data_type_node_id_to_string()`, but the individual `NodeAttribute` entries in the `attributes` vector all say "String".

**File**: `src-tauri/src/ua_client/client.rs:685-690`

**Change**: Use `variant_type_name()` to determine the actual type from the variant value:

```rust
// BEFORE (line 685-690):
                attributes.push(NodeAttribute {
                    name: attr_name,
                    value: attr_value,
                    data_type: Some("String".to_string()),
                    status: attr_status,
                });

// AFTER:
                attributes.push(NodeAttribute {
                    name: attr_name,
                    value: attr_value,
                    data_type: dv.value.as_ref().map(variant_type_name),
                    status: attr_status,
                });
```

---

### Fix #3: `string_to_variant()` missing DateTime, Guid, NodeId, ByteString (line 1577-1632)

**Problem**: When writing values or calling methods, `string_to_variant()` converts a string+type_name pair to a `Variant`. Currently it handles Boolean, all integer types, Float, and Double — but falls through to `Variant::String` for DateTime, Guid, NodeId, ByteString, StatusCode, etc. This means:
- Writing a DateTime value to a DateTime node will send a String variant (type mismatch → server rejects)
- Same for Guid, NodeId, ByteString fields
- Method calls with these argument types will also fail

**File**: `src-tauri/src/ua_client/client.rs:1584-1631`

**Change**: Add cases for the most common missing types before the fallback:

```rust
// Add these cases before the `_ =>` catch-all (line 1630):

        "String" | "string" => Ok(Variant::String(opcua::types::UAString::from(value))),
        "DateTime" | "datetime" | "UtcTime" => {
            let dt = chrono::DateTime::parse_from_rfc3339(value)
                .map_err(|_| parse_err(data_type, value))?;
            Ok(Variant::DateTime(Box::new(dt.with_timezone(&chrono::Utc).into())))
        }
        "Guid" | "guid" => {
            let guid = opcua::types::Guid::from_str(value)
                .map_err(|_| parse_err(data_type, value))?;
            Ok(Variant::Guid(Box::new(guid)))
        }
        "NodeId" | "nodeid" => {
            let nid = NodeId::from_str(value)
                .map_err(|_| parse_err(data_type, value))?;
            Ok(Variant::NodeId(Box::new(nid)))
        }
        "ByteString" | "bytestring" => {
            // Accept hex-encoded byte strings
            let bytes = (0..value.len())
                .step_by(2)
                .map(|i| u8::from_str_radix(&value[i..i + 2], 16))
                .collect::<Result<Vec<u8>, _>>()
                .map_err(|_| parse_err(data_type, value))?;
            Ok(Variant::ByteString(opcua::types::ByteString::from(bytes)))
        }
        "StatusCode" | "statuscode" => {
            let code = value
                .parse::<u32>()
                .map_err(|_| parse_err(data_type, value))?;
            Ok(Variant::StatusCode(StatusCode::from(code)))
        }
        _ => Ok(Variant::String(opcua::types::UAString::from(value))),
```

Note: We need to check if `opcua::types::Guid::from_str` exists in async-opcua 0.18. If not, we'll use `uuid::Uuid::parse_str` and convert. Will verify during implementation.

---

## Phase 2: Moderate

### Fix #4: `has_children` overly broad — Variable/Method nodes show expand arrows (line 522-528)

**Problem**: The browse logic marks Variable and Method nodes as `has_children = true`. In OPC UA, Variables *can* have children (sub-variables via HasComponent), but Methods almost never do. More importantly, the current logic causes **every** Variable and Method to show an expand arrow in the tree UI, even when they have zero children. Clicking expand returns an empty list, which is confusing.

**File**: `src-tauri/src/ua_client/client.rs:522-528`

**Change**: Only mark Object and View nodes as definitively having children. For Variable nodes, we could potentially do a sub-browse, but that would be expensive. The pragmatic fix is to mark only Object/View:

```rust
// BEFORE:
                        let has_children = matches!(
                            r.node_class,
                            opcua::types::NodeClass::Object
                                | opcua::types::NodeClass::View
                                | opcua::types::NodeClass::Variable
                                | opcua::types::NodeClass::Method
                        );

// AFTER:
                        let has_children = matches!(
                            r.node_class,
                            opcua::types::NodeClass::Object
                                | opcua::types::NodeClass::View
                        );
```

This means a rare Variable with sub-variables won't show an expand arrow, but the tree will still be browsable from parent Object nodes. This is the standard behavior in most OPC UA clients (e.g., UaExpert).

---

### Fix #5: Hard-coded `UserTokenPolicy` for Username auth (line 312-318)

**Problem**: When connecting with username/password auth, the code constructs a `UserTokenPolicy` with a hard-coded `policy_id` of `"username_basic256sha256"`. If the server doesn't advertise a token policy with exactly this ID, `connect_to_matching_endpoint()` will fail to match endpoints. Most servers use different policy IDs (e.g., `"username"`, `"1"`, `"UserName_Policy"`).

The endpoint discovery already collects `user_identity_tokens` with their `policy_id` and `token_type`. But the connect flow ignores this information.

**File**: `src-tauri/src/ua_client/client.rs:310-326`

**Change**: Use a generic `UserTokenPolicy` with just the `token_type` set and leave the `policy_id` empty. The SDK's `connect_to_matching_endpoint` should match by token type. Alternatively, we can use `UserTokenPolicy::user_pass_security_policy_id("")`:

```rust
// BEFORE (line 310-318):
        let user_token_policy = match config.auth_type {
            AuthType::Anonymous => UserTokenPolicy::anonymous(),
            AuthType::UsernamePassword => UserTokenPolicy {
                policy_id: opcua::types::UAString::from("username_basic256sha256"),
                token_type: opcua::types::UserTokenType::UserName,
                issued_token_type: opcua::types::UAString::null(),
                issuer_endpoint_url: opcua::types::UAString::null(),
                security_policy_uri: opcua::types::UAString::null(),
            },
            ...

// AFTER:
        let user_token_policy = match config.auth_type {
            AuthType::Anonymous => UserTokenPolicy::anonymous(),
            AuthType::UsernamePassword => UserTokenPolicy {
                policy_id: opcua::types::UAString::null(),
                token_type: opcua::types::UserTokenType::UserName,
                issued_token_type: opcua::types::UAString::null(),
                issuer_endpoint_url: opcua::types::UAString::null(),
                security_policy_uri: opcua::types::UAString::null(),
            },
            ...
```

Note: Need to verify how `connect_to_matching_endpoint` handles a null `policy_id`. If it requires a non-null value, we'll use `UAString::from("")` instead. Will verify the SDK source during implementation.

---

### Fix #6: History continuation point returned but unusable (line 862, 902)

**Problem**: `read_history()` always sends a default (empty) continuation point, meaning it only ever reads the first page. The response correctly includes the continuation point as a hex string (line 902), and it's returned to the frontend in `HistoryReadResult.continuation_point`. But:
- `HistoryReadRequest` has no `continuation_point` field
- The frontend never passes it back
- There's no way to paginate large history datasets

**Files**: 
- `src-tauri/src/ua_client/types.rs:160-165` (HistoryReadRequest)
- `src-tauri/src/ua_client/client.rs:858-862` (nodes_to_read construction)
- `src/types/opcua.ts` (TypeScript HistoryReadRequest)

**Change**:

1. Add `continuation_point` to `HistoryReadRequest` in types:
```rust
// types.rs HistoryReadRequest:
pub struct HistoryReadRequest {
    pub node_id: String,
    pub start_time: Option<String>,
    pub end_time: Option<String>,
    pub max_values: Option<u32>,
    pub continuation_point: Option<String>,  // hex-encoded
}
```

2. Parse and use it in `client.rs`:
```rust
// client.rs read_history():
        let cp = request.continuation_point.as_deref()
            .map(|hex| {
                (0..hex.len())
                    .step_by(2)
                    .map(|i| u8::from_str_radix(&hex[i..i + 2], 16))
                    .collect::<Result<Vec<u8>, _>>()
            })
            .transpose()
            .map_err(|_| AppError::invalid_argument("Invalid continuation point hex string"))?
            .map(opcua::types::ByteString::from)
            .unwrap_or_default();

        let nodes_to_read = [HistoryReadValueId {
            node_id,
            index_range: NumericRange::None,
            data_encoding: QualifiedName::null(),
            continuation_point: cp,
        }];
```

3. Add to TypeScript type:
```typescript
// types/opcua.ts:
export interface HistoryReadRequest {
  node_id: string;
  start_time?: string;
  end_time?: string;
  max_values?: number;
  continuation_point?: string;
}
```

Note: The frontend currently doesn't have a "Load More" button for history — that's a UI enhancement, not strictly needed for this fix. The backend just needs to accept continuation points.

---

### Fix #7: Certificate auth listed in UI but explicitly rejected (line 301-306)

**Problem**: `AuthType::Certificate` is defined in the enum (types.rs:43) and the UI likely shows it as an option in the ConnectionPanel. But `connect()` immediately returns an error if Certificate auth is selected (line 301-306). Users selecting this option get a confusing error rather than the option being hidden/disabled.

**Files**: 
- `src/components/opcua/ConnectionPanel.tsx` — check if Certificate appears in dropdown
- This is a UI-only fix if we hide it, or a documentation/label fix

**Change**: In the ConnectionPanel, either:
- (a) Remove "Certificate" from the auth type dropdown entirely, OR
- (b) Show it as disabled with tooltip "Not yet supported"

Option (b) is better because it signals future intent. Need to check the ConnectionPanel code during implementation to determine the exact change.

---

## Phase 3: Low

### Fix #8: Already fixed (inferMethodParent duplication)

**Status**: Verified — `inferMethodParent` exists only in `src/utils/opcua.ts` and is imported in `AddressSpaceTree.tsx`. The `MethodCaller.tsx` component does not contain a duplicate. **No action needed.**

---

### Fix #9: `readValues` service function is dead code (services/opcua.ts:81-86)

**Problem**: `readValues` is exported from `services/opcua.ts` but never imported or called anywhere in the frontend. The corresponding Rust command `opcua_read_values` exists and works, but the frontend doesn't use it (reads are done via `readNodeDetails` instead).

**File**: `src/services/opcua.ts:81-86`

**Change**: Keep the function — it's a valid API for batch reads and may be used in future features (e.g., Dashboard could use it to refresh multiple values at once). Add a comment noting it's available for future use:

```typescript
/** Batch-read current values for multiple nodes. Currently unused in the UI but
 *  available for custom dashboards or future batch-refresh features. */
export const readValues = withLogging(
  ...
```

**Alternative**: Remove it to reduce dead code. This is a judgment call — keeping it is marginally useful.

---

### Fix #10: No PKI/trust management UI

**Problem**: The client uses `trust_server_certs(false)` (line 280, 440), which means it **rejects all unrecognized server certificates**. Combined with `create_sample_keypair(true)`, the client auto-generates its own keypair but has no way for users to accept/trust server certs that aren't auto-trusted.

This is an **architectural limitation** rather than a bug. Implementing PKI management would require:
- A certificate trust store UI
- APIs to list/accept/reject server certificates
- Possibly a first-connect "trust this certificate?" dialog

**Recommendation**: This is out of scope for this passthrough. Document it as a known limitation. No code changes needed now.

---

## Implementation Order

1. **Fix #2** (data_type hard-coded) — One-line change, lowest risk
2. **Fix #4** (has_children) — Two-line change, low risk
3. **Fix #9** (dead code comment) — One-line comment, no risk
4. **Fix #1** (event subscription tracking) — Small structural change
5. **Fix #3** (string_to_variant types) — Medium addition, needs API verification
6. **Fix #5** (hard-coded UserTokenPolicy) — Needs SDK behavior verification
7. **Fix #6** (history continuation points) — Cross-cutting (types + client + TS)
8. **Fix #7** (certificate auth UI) — Frontend-only change

Fixes #8 and #10 require no code changes.

---

## Verification

After all fixes:
```bash
cargo build          # Backend compiles
npm run build        # Frontend compiles
cargo test           # Existing tests pass
```
