use std::collections::HashMap;
use std::sync::Arc;
use std::sync::atomic::{AtomicU32, Ordering};

use tokio::sync::{Mutex, OnceCell, RwLock};

use crate::error::{AppError, AppResult};

use super::client::ModbusClientConnection;
use super::simulator::ModbusSimulator;
use super::types::*;

// ─── Connection Backend ──────────────────────────────────────────

enum ModbusBackend {
    Simulator,
    Live(Arc<Mutex<ModbusClientConnection>>),
}

struct MonitorConfig {
    register_type: RegisterType,
    start_address: u16,
    count: u16,
    data_type: ModbusDataType,
    label: String,
    read_count: u64,
    error_count: u64,
    last_error: Option<String>,
    latest_values: Vec<RegisterValue>,
}

struct ModbusConnectionState {
    config: ModbusConnectionConfig,
    status: ModbusConnectionStatus,
    last_error: Option<String>,
    backend: ModbusBackend,
    monitors: HashMap<u32, MonitorConfig>,
}

type SharedModbusState = Arc<RwLock<ModbusConnectionState>>;

// ─── Manager ─────────────────────────────────────────────────────

pub struct ModbusManager {
    connections: RwLock<HashMap<String, SharedModbusState>>,
    simulator: OnceCell<ModbusSimulator>,
    next_monitor_id: AtomicU32,
}

impl ModbusManager {
    pub fn new() -> Self {
        Self {
            connections: RwLock::new(HashMap::new()),
            simulator: OnceCell::new(),
            next_monitor_id: AtomicU32::new(1),
        }
    }

    /// Get or lazily initialize the shared simulator instance.
    async fn simulator(&self) -> &ModbusSimulator {
        self.simulator
            .get_or_init(|| async { ModbusSimulator::new() })
            .await
    }

    async fn get_connection(&self, connection_id: &str) -> AppResult<SharedModbusState> {
        self.connections
            .read()
            .await
            .get(connection_id)
            .cloned()
            .ok_or_else(|| {
                AppError::not_found(format!("Modbus connection '{connection_id}' not found"))
            })
    }

    // ─── Connect / Disconnect ────────────────────────────────────

    pub async fn connect(&self, config: ModbusConnectionConfig) -> AppResult<String> {
        let id = uuid::Uuid::new_v4().to_string();

        let backend = if config.use_simulator {
            log::info!(
                "Modbus: starting simulator connection '{}'",
                config.name
            );
            ModbusBackend::Simulator
        } else {
            log::info!(
                "Modbus: connecting '{}' to {}:{} (unit {})",
                config.name,
                config.host,
                config.port,
                config.unit_id
            );
            let conn = ModbusClientConnection::connect(&config).await?;
            ModbusBackend::Live(Arc::new(Mutex::new(conn)))
        };

        let state = Arc::new(RwLock::new(ModbusConnectionState {
            config,
            status: ModbusConnectionStatus::Connected,
            last_error: None,
            backend,
            monitors: HashMap::new(),
        }));

        self.connections.write().await.insert(id.clone(), state);
        Ok(id)
    }

    pub async fn disconnect(&self, connection_id: &str) -> AppResult<()> {
        let state = self
            .connections
            .write()
            .await
            .remove(connection_id)
            .ok_or_else(|| AppError::not_found("Modbus connection not found"))?;

        let guard = state.read().await;
        if let ModbusBackend::Live(client) = &guard.backend {
            let client = client.lock().await;
            let _ = client.disconnect().await;
        }

        Ok(())
    }

    pub async fn disconnect_all(&self) {
        let all_states: Vec<SharedModbusState> = {
            let mut map = self.connections.write().await;
            map.drain().map(|(_, state)| state).collect()
        };

        for state in all_states {
            let guard = state.read().await;
            if let ModbusBackend::Live(client) = &guard.backend {
                let client = client.lock().await;
                let _ = client.disconnect().await;
            }
        }
    }

    // ─── Connection Info ─────────────────────────────────────────

    pub async fn list_connections(&self) -> Vec<ModbusConnectionInfo> {
        let entries: Vec<(String, SharedModbusState)> = self
            .connections
            .read()
            .await
            .iter()
            .map(|(id, state)| (id.clone(), state.clone()))
            .collect();

        let mut results = Vec::with_capacity(entries.len());
        for (id, state) in entries {
            let guard = state.read().await;
            results.push(ModbusConnectionInfo {
                id,
                name: guard.config.name.clone(),
                host: guard.config.host.clone(),
                port: guard.config.port,
                unit_id: guard.config.unit_id,
                status: guard.status,
                is_simulator: matches!(guard.backend, ModbusBackend::Simulator),
                last_error: guard.last_error.clone(),
            });
        }

        results
    }

    pub async fn get_status(
        &self,
        connection_id: &str,
    ) -> AppResult<ModbusConnectionStatus> {
        let state = self.get_connection(connection_id).await?;
        let mut guard = state.write().await;

        // For live connections, verify the client is still connected
        let client_arc = match &guard.backend {
            ModbusBackend::Live(client) => Some(client.clone()),
            _ => None,
        };

        if let Some(client_arc) = client_arc {
            let client = client_arc.lock().await;
            if client.is_connected() {
                guard.status = ModbusConnectionStatus::Connected;
                guard.last_error = None;
            } else if guard.status == ModbusConnectionStatus::Connected {
                guard.status = ModbusConnectionStatus::Error;
                guard.last_error = Some("Connection lost".to_string());
            }
        }
        // Simulator is always "connected"

        Ok(guard.status)
    }

    // ─── Register Read / Write ───────────────────────────────────

    pub async fn read_registers(
        &self,
        connection_id: &str,
        request: &RegisterReadRequest,
    ) -> AppResult<Vec<RegisterValue>> {
        validate_request(
            request.register_type,
            request.start_address,
            request.count,
            ModbusDataType::U16, // read_registers returns raw per-register values
            false,
        )?;

        // Clone the backend Arc under a short read lock, then release
        let backend_ref = {
            let guard = self.get_connection(connection_id).await?;
            let g = guard.read().await;
            match &g.backend {
                ModbusBackend::Simulator => None,
                ModbusBackend::Live(c) => Some(c.clone()),
            }
        };

        let timestamp = now_iso8601();

        match request.register_type {
            RegisterType::Coil => {
                let data = match &backend_ref {
                    None => self.simulator().await.read_coils(request.start_address, request.count).await?,
                    Some(c) => { let c = c.lock().await; c.read_coils(request.start_address, request.count).await? }
                };
                Ok(data
                    .iter()
                    .enumerate()
                    .map(|(i, &v)| RegisterValue {
                        address: request.start_address.saturating_add(i as u16),
                        register_type: RegisterType::Coil,
                        value: v.to_string(),
                        raw: vec![v as u16],
                        timestamp: timestamp.clone(),
                    })
                    .collect())
            }
            RegisterType::DiscreteInput => {
                let data = match &backend_ref {
                    None => self.simulator().await.read_discrete_inputs(request.start_address, request.count).await?,
                    Some(c) => { let c = c.lock().await; c.read_discrete_inputs(request.start_address, request.count).await? }
                };
                Ok(data
                    .iter()
                    .enumerate()
                    .map(|(i, &v)| RegisterValue {
                        address: request.start_address.saturating_add(i as u16),
                        register_type: RegisterType::DiscreteInput,
                        value: v.to_string(),
                        raw: vec![v as u16],
                        timestamp: timestamp.clone(),
                    })
                    .collect())
            }
            RegisterType::InputRegister => {
                let data = match &backend_ref {
                    None => self.simulator().await.read_input_registers(request.start_address, request.count).await?,
                    Some(c) => { let c = c.lock().await; c.read_input_registers(request.start_address, request.count).await? }
                };
                Ok(data
                    .iter()
                    .enumerate()
                    .map(|(i, &v)| RegisterValue {
                        address: request.start_address.saturating_add(i as u16),
                        register_type: RegisterType::InputRegister,
                        value: v.to_string(),
                        raw: vec![v],
                        timestamp: timestamp.clone(),
                    })
                    .collect())
            }
            RegisterType::HoldingRegister => {
                let data = match &backend_ref {
                    None => self.simulator().await.read_holding_registers(request.start_address, request.count).await?,
                    Some(c) => { let c = c.lock().await; c.read_holding_registers(request.start_address, request.count).await? }
                };
                Ok(data
                    .iter()
                    .enumerate()
                    .map(|(i, &v)| RegisterValue {
                        address: request.start_address.saturating_add(i as u16),
                        register_type: RegisterType::HoldingRegister,
                        value: v.to_string(),
                        raw: vec![v],
                        timestamp: timestamp.clone(),
                    })
                    .collect())
            }
        }
    }

    pub async fn write_registers(
        &self,
        connection_id: &str,
        request: &RegisterWriteRequest,
    ) -> AppResult<Vec<RegisterWriteResult>> {
        let count = request.values.len() as u16;
        validate_request(
            request.register_type,
            request.start_address,
            count,
            request.data_type,
            true,
        )?;

        // Clone the backend Arc under a short read lock, then release
        let backend_ref = {
            let state = self.get_connection(connection_id).await?;
            let g = state.read().await;
            match &g.backend {
                ModbusBackend::Simulator => None,
                ModbusBackend::Live(c) => Some(c.clone()),
            }
        };

        match request.register_type {
            RegisterType::Coil => {
                let bools: Vec<bool> = request
                    .values
                    .iter()
                    .map(|v| parse_bool_value(v))
                    .collect::<AppResult<Vec<_>>>()?;

                let result = match &backend_ref {
                    None => self.simulator().await.write_coils(request.start_address, &bools).await,
                    Some(c) => {
                        let c = c.lock().await;
                        if bools.len() == 1 {
                            c.write_single_coil(request.start_address, bools[0]).await
                        } else {
                            c.write_multiple_coils(request.start_address, &bools).await
                        }
                    }
                };

                Ok(vec![RegisterWriteResult {
                    address: request.start_address,
                    success: result.is_ok(),
                    error: result.err().map(|e| e.to_string()),
                }])
            }
            RegisterType::HoldingRegister => {
                let words = parse_register_values(&request.values, request.data_type)?;

                let result = match &backend_ref {
                    None => self.simulator().await.write_holding_registers(request.start_address, &words).await,
                    Some(c) => {
                        let c = c.lock().await;
                        if words.len() == 1 {
                            c.write_single_register(request.start_address, words[0]).await
                        } else {
                            c.write_multiple_registers(request.start_address, &words).await
                        }
                    }
                };

                Ok(vec![RegisterWriteResult {
                    address: request.start_address,
                    success: result.is_ok(),
                    error: result.err().map(|e| e.to_string()),
                }])
            }
            _ => Err(AppError::modbus(format!(
                "Cannot write to {} registers (read-only)",
                request.register_type
            ))),
        }
    }

    // ─── Monitor Management ──────────────────────────────────────

    pub async fn add_monitor(
        &self,
        connection_id: &str,
        request: &MonitorRequest,
    ) -> AppResult<MonitoredRegister> {
        validate_request(
            request.register_type,
            request.start_address,
            request.count,
            request.data_type,
            false,
        )?;

        let state = self.get_connection(connection_id).await?;
        let mut guard = state.write().await;

        let monitor_id = self.next_monitor_id.fetch_add(1, Ordering::Relaxed);
        let label = request
            .label
            .clone()
            .unwrap_or_else(|| {
                format!(
                    "{} {}-{}",
                    request.register_type,
                    request.start_address,
                    request.start_address + request.count - 1
                )
            });

        let config = MonitorConfig {
            register_type: request.register_type,
            start_address: request.start_address,
            count: request.count,
            data_type: request.data_type,
            label: label.clone(),
            read_count: 0,
            error_count: 0,
            last_error: None,
            latest_values: Vec::new(),
        };

        guard.monitors.insert(monitor_id, config);

        Ok(MonitoredRegister {
            id: monitor_id,
            register_type: request.register_type,
            start_address: request.start_address,
            count: request.count,
            data_type: request.data_type,
            label,
            latest_values: Vec::new(),
            read_count: 0,
            error_count: 0,
            last_error: None,
        })
    }

    pub async fn remove_monitor(
        &self,
        connection_id: &str,
        monitor_id: u32,
    ) -> AppResult<()> {
        let state = self.get_connection(connection_id).await?;
        let mut guard = state.write().await;

        guard
            .monitors
            .remove(&monitor_id)
            .ok_or_else(|| AppError::not_found("Monitor not found"))?;

        Ok(())
    }

    pub async fn get_monitors(
        &self,
        connection_id: &str,
    ) -> AppResult<Vec<MonitoredRegister>> {
        let state = self.get_connection(connection_id).await?;
        let guard = state.read().await;

        Ok(guard
            .monitors
            .iter()
            .map(|(id, m)| MonitoredRegister {
                id: *id,
                register_type: m.register_type,
                start_address: m.start_address,
                count: m.count,
                data_type: m.data_type,
                label: m.label.clone(),
                latest_values: m.latest_values.clone(),
                read_count: m.read_count,
                error_count: m.error_count,
                last_error: m.last_error.clone(),
            })
            .collect())
    }

    /// Poll all monitors for a connection, reading current register values.
    ///
    /// Uses a read-IO-write pattern to minimize lock contention:
    /// 1. Read lock to collect monitor configs and clone backend ref
    /// 2. Release lock, perform all network I/O
    /// 3. Write lock to update monitor state with results
    pub async fn poll_monitors(
        &self,
        connection_id: &str,
    ) -> AppResult<ModbusPollResponse> {
        let start = std::time::Instant::now();
        let state = self.get_connection(connection_id).await?;

        // ── Phase 1: collect configs under read lock ─────────────
        let (monitor_entries, backend_ref, is_simulator) = {
            let guard = state.read().await;
            let backend_ref = match &guard.backend {
                ModbusBackend::Simulator => None,
                ModbusBackend::Live(c) => Some(c.clone()),
            };
            let is_simulator = backend_ref.is_none();
            let entries: Vec<(u32, RegisterType, u16, u16, ModbusDataType)> = guard
                .monitors
                .iter()
                .map(|(&id, m)| (id, m.register_type, m.start_address, m.count, m.data_type))
                .collect();
            (entries, backend_ref, is_simulator)
        }; // read lock released here

        // ── Phase 2: perform I/O without any lock held ───────────
        let timestamp = now_iso8601();

        let mut io_results: Vec<(u32, RegisterType, u16, u16, ModbusDataType, Result<Vec<u16>, AppError>)> =
            Vec::with_capacity(monitor_entries.len());

        for (id, reg_type, start_addr, count, data_type) in monitor_entries {
            let read_result = if is_simulator {
                self.read_registers_from_simulator(reg_type, start_addr, count)
                    .await
            } else {
                let client_ref = backend_ref.as_ref().ok_or_else(|| {
                    AppError::modbus("Live backend lost during poll")
                })?;
                self.read_registers_from_live(client_ref, reg_type, start_addr, count)
                    .await
            };
            io_results.push((id, reg_type, start_addr, count, data_type, read_result));
        }

        // ── Phase 3: write lock to update state with results ─────
        let mut guard = state.write().await;
        let mut results = Vec::with_capacity(io_results.len());

        for (id, reg_type, start_addr, _count, data_type, read_result) in &io_results {
            let Some(monitor) = guard.monitors.get_mut(id) else {
                // Monitor was removed between phase 1 and phase 3 — skip
                continue;
            };
            monitor.read_count += 1;

            match read_result {
                Ok(raw_values) => {
                    let values = format_register_values(
                        *reg_type,
                        *start_addr,
                        raw_values,
                        *data_type,
                        &timestamp,
                    );
                    monitor.latest_values = values;
                    monitor.last_error = None;
                }
                Err(e) => {
                    monitor.error_count += 1;
                    monitor.last_error = Some(e.to_string());
                }
            }

            results.push(MonitoredRegister {
                id: *id,
                register_type: monitor.register_type,
                start_address: monitor.start_address,
                count: monitor.count,
                data_type: monitor.data_type,
                label: monitor.label.clone(),
                latest_values: monitor.latest_values.clone(),
                read_count: monitor.read_count,
                error_count: monitor.error_count,
                last_error: monitor.last_error.clone(),
            });
        }

        let poll_duration_ms = start.elapsed().as_millis() as u64;

        Ok(ModbusPollResponse {
            monitors: results,
            poll_duration_ms,
        })
    }

    // ─── Poll Helpers ────────────────────────────────────────────

    /// Raw read returning u16 words (or bool-as-u16 for bit types) for polling.
    async fn read_registers_from_simulator(
        &self,
        reg_type: RegisterType,
        start: u16,
        count: u16,
    ) -> AppResult<Vec<u16>> {
        let sim = self.simulator().await;
        match reg_type {
            RegisterType::Coil => {
                let bools = sim.read_coils(start, count).await?;
                Ok(bools.iter().map(|&b| b as u16).collect())
            }
            RegisterType::DiscreteInput => {
                let bools = sim.read_discrete_inputs(start, count).await?;
                Ok(bools.iter().map(|&b| b as u16).collect())
            }
            RegisterType::InputRegister => {
                sim.read_input_registers(start, count).await
            }
            RegisterType::HoldingRegister => {
                sim.read_holding_registers(start, count).await
            }
        }
    }

    async fn read_registers_from_live(
        &self,
        client: &Arc<Mutex<ModbusClientConnection>>,
        reg_type: RegisterType,
        start: u16,
        count: u16,
    ) -> AppResult<Vec<u16>> {
        let client = client.lock().await;
        match reg_type {
            RegisterType::Coil => {
                let bools = client.read_coils(start, count).await?;
                Ok(bools.iter().map(|&b| b as u16).collect())
            }
            RegisterType::DiscreteInput => {
                let bools = client.read_discrete_inputs(start, count).await?;
                Ok(bools.iter().map(|&b| b as u16).collect())
            }
            RegisterType::InputRegister => {
                client.read_input_registers(start, count).await
            }
            RegisterType::HoldingRegister => {
                client.read_holding_registers(start, count).await
            }
        }
    }
}

impl Default for ModbusManager {
    fn default() -> Self {
        Self::new()
    }
}

// ─── Helpers ─────────────────────────────────────────────────────

fn now_iso8601() -> String {
    chrono::Utc::now().to_rfc3339_opts(chrono::SecondsFormat::Millis, true)
}

// Modbus TCP spec limits per single PDU
const MAX_READ_BITS: u16 = 2000;       // FC01/FC02
const MAX_READ_REGISTERS: u16 = 125;   // FC03/FC04
const MAX_WRITE_COILS: u16 = 1968;     // FC15
const MAX_WRITE_REGISTERS: u16 = 123;  // FC16

/// Validate register count against Modbus TCP spec limits, address overflow,
/// and 32-bit data type alignment.
fn validate_request(
    register_type: RegisterType,
    start_address: u16,
    count: u16,
    data_type: ModbusDataType,
    is_write: bool,
) -> AppResult<()> {
    if count == 0 {
        return Err(AppError::invalid_argument("Register count must be > 0"));
    }

    // Address overflow: start + count must fit in u16 address space
    let end = start_address as u32 + count as u32;
    if end > 0x10000 {
        return Err(AppError::invalid_argument(format!(
            "Address range {start_address}..{} exceeds 16-bit address space (max 65536)",
            end
        )));
    }

    // Modbus spec PDU limits
    let limit = match (register_type, is_write) {
        (RegisterType::Coil, false) | (RegisterType::DiscreteInput, false) => MAX_READ_BITS,
        (RegisterType::HoldingRegister, false) | (RegisterType::InputRegister, false) => MAX_READ_REGISTERS,
        (RegisterType::Coil, true) => MAX_WRITE_COILS,
        (RegisterType::HoldingRegister, true) => MAX_WRITE_REGISTERS,
        // Discrete inputs and input registers are read-only
        (RegisterType::DiscreteInput, true) | (RegisterType::InputRegister, true) => {
            return Err(AppError::invalid_argument(format!(
                "{register_type} registers are read-only"
            )));
        }
    };
    if count > limit {
        return Err(AppError::invalid_argument(format!(
            "Count {count} exceeds Modbus spec limit of {limit} for {register_type}"
        )));
    }

    // 32-bit data types require an even number of registers
    if matches!(data_type, ModbusDataType::U32 | ModbusDataType::I32 | ModbusDataType::F32) {
        if matches!(register_type, RegisterType::HoldingRegister | RegisterType::InputRegister) && count % 2 != 0 {
            return Err(AppError::invalid_argument(format!(
                "Data type {data_type} requires an even register count, got {count}"
            )));
        }
    }

    Ok(())
}

// ─── Value Parsing / Formatting ──────────────────────────────────

fn parse_bool_value(s: &str) -> AppResult<bool> {
    match s.trim().to_lowercase().as_str() {
        "true" | "1" | "on" | "yes" => Ok(true),
        "false" | "0" | "off" | "no" => Ok(false),
        _ => Err(AppError::invalid_argument(format!(
            "Cannot parse '{s}' as boolean"
        ))),
    }
}

fn parse_register_values(values: &[String], data_type: ModbusDataType) -> AppResult<Vec<u16>> {
    let mut words = Vec::new();

    for v in values {
        match data_type {
            ModbusDataType::Bool => {
                let b = parse_bool_value(v)?;
                words.push(if b { 1 } else { 0 });
            }
            ModbusDataType::U16 => {
                let n: u16 = v
                    .trim()
                    .parse()
                    .map_err(|e| AppError::invalid_argument(format!("Invalid u16 '{v}': {e}")))?;
                words.push(n);
            }
            ModbusDataType::I16 => {
                let n: i16 = v
                    .trim()
                    .parse()
                    .map_err(|e| AppError::invalid_argument(format!("Invalid i16 '{v}': {e}")))?;
                words.push(n as u16);
            }
            ModbusDataType::U32 => {
                let n: u32 = v
                    .trim()
                    .parse()
                    .map_err(|e| AppError::invalid_argument(format!("Invalid u32 '{v}': {e}")))?;
                words.push((n >> 16) as u16);
                words.push((n & 0xFFFF) as u16);
            }
            ModbusDataType::I32 => {
                let n: i32 = v
                    .trim()
                    .parse()
                    .map_err(|e| AppError::invalid_argument(format!("Invalid i32 '{v}': {e}")))?;
                let u = n as u32;
                words.push((u >> 16) as u16);
                words.push((u & 0xFFFF) as u16);
            }
            ModbusDataType::F32 => {
                let f: f32 = v
                    .trim()
                    .parse()
                    .map_err(|e| AppError::invalid_argument(format!("Invalid f32 '{v}': {e}")))?;
                let bits = f.to_bits();
                words.push((bits >> 16) as u16);
                words.push((bits & 0xFFFF) as u16);
            }
        }
    }

    Ok(words)
}

/// Format raw u16 words into human-readable RegisterValue entries based on data type.
fn format_register_values(
    reg_type: RegisterType,
    start: u16,
    raw: &[u16],
    data_type: ModbusDataType,
    timestamp: &str,
) -> Vec<RegisterValue> {
    // For bit types, always format as bool
    if matches!(reg_type, RegisterType::Coil | RegisterType::DiscreteInput) {
        return raw
            .iter()
            .enumerate()
            .map(|(i, &v)| RegisterValue {
                address: start.saturating_add(i as u16),
                register_type: reg_type,
                value: (v != 0).to_string(),
                raw: vec![v],
                timestamp: timestamp.to_string(),
            })
            .collect();
    }

    match data_type {
        ModbusDataType::Bool => raw
            .iter()
            .enumerate()
            .map(|(i, &v)| RegisterValue {
                address: start.saturating_add(i as u16),
                register_type: reg_type,
                value: (v != 0).to_string(),
                raw: vec![v],
                timestamp: timestamp.to_string(),
            })
            .collect(),
        ModbusDataType::U16 => raw
            .iter()
            .enumerate()
            .map(|(i, &v)| RegisterValue {
                address: start.saturating_add(i as u16),
                register_type: reg_type,
                value: v.to_string(),
                raw: vec![v],
                timestamp: timestamp.to_string(),
            })
            .collect(),
        ModbusDataType::I16 => raw
            .iter()
            .enumerate()
            .map(|(i, &v)| RegisterValue {
                address: start.saturating_add(i as u16),
                register_type: reg_type,
                value: (v as i16).to_string(),
                raw: vec![v],
                timestamp: timestamp.to_string(),
            })
            .collect(),
        ModbusDataType::U32 => raw
            .chunks(2)
            .enumerate()
            .map(|(i, chunk)| {
                let val = if chunk.len() == 2 {
                    ((chunk[0] as u32) << 16) | (chunk[1] as u32)
                } else {
                    chunk[0] as u32
                };
                RegisterValue {
                    address: start.saturating_add((i * 2) as u16),
                    register_type: reg_type,
                    value: val.to_string(),
                    raw: chunk.to_vec(),
                    timestamp: timestamp.to_string(),
                }
            })
            .collect(),
        ModbusDataType::I32 => raw
            .chunks(2)
            .enumerate()
            .map(|(i, chunk)| {
                let val = if chunk.len() == 2 {
                    (((chunk[0] as u32) << 16) | (chunk[1] as u32)) as i32
                } else {
                    chunk[0] as i32
                };
                RegisterValue {
                    address: start.saturating_add((i * 2) as u16),
                    register_type: reg_type,
                    value: val.to_string(),
                    raw: chunk.to_vec(),
                    timestamp: timestamp.to_string(),
                }
            })
            .collect(),
        ModbusDataType::F32 => raw
            .chunks(2)
            .enumerate()
            .map(|(i, chunk)| {
                let val = if chunk.len() == 2 {
                    let bits = ((chunk[0] as u32) << 16) | (chunk[1] as u32);
                    f32::from_bits(bits)
                } else {
                    f32::from_bits(chunk[0] as u32)
                };
                RegisterValue {
                    address: start.saturating_add((i * 2) as u16),
                    register_type: reg_type,
                    value: format!("{val:.4}"),
                    raw: chunk.to_vec(),
                    timestamp: timestamp.to_string(),
                }
            })
            .collect(),
    }
}
