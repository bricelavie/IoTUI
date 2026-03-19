use serde::{Deserialize, Serialize};
use std::fmt;

// ─── Connection Types ────────────────────────────────────────────

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ModbusConnectionStatus {
    Disconnected,
    Connecting,
    Connected,
    Error,
}

#[derive(Clone, Serialize, Deserialize)]
pub struct ModbusConnectionConfig {
    pub name: String,
    pub host: String,
    pub port: u16,
    /// Modbus slave/unit ID (1–247, 0 = broadcast)
    pub unit_id: u8,
    /// When true, use the built-in simulator instead of connecting to a real device.
    #[serde(default)]
    pub use_simulator: bool,
    /// Per-request timeout in milliseconds.
    pub timeout_ms: Option<u32>,
}

impl fmt::Debug for ModbusConnectionConfig {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.debug_struct("ModbusConnectionConfig")
            .field("name", &self.name)
            .field("host", &self.host)
            .field("port", &self.port)
            .field("unit_id", &self.unit_id)
            .field("use_simulator", &self.use_simulator)
            .field("timeout_ms", &self.timeout_ms)
            .finish()
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ModbusConnectionInfo {
    pub id: String,
    pub name: String,
    pub host: String,
    pub port: u16,
    pub unit_id: u8,
    pub status: ModbusConnectionStatus,
    pub is_simulator: bool,
    pub last_error: Option<String>,
}

// ─── Register Types ──────────────────────────────────────────────

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum RegisterType {
    /// Discrete output coils — read/write, 1-bit (FC 01/05/15)
    Coil,
    /// Discrete input contacts — read-only, 1-bit (FC 02)
    DiscreteInput,
    /// 16-bit input registers — read-only (FC 04)
    InputRegister,
    /// 16-bit holding registers — read/write (FC 03/06/16)
    HoldingRegister,
}

impl fmt::Display for RegisterType {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::Coil => write!(f, "Coil"),
            Self::DiscreteInput => write!(f, "Discrete Input"),
            Self::InputRegister => write!(f, "Input Register"),
            Self::HoldingRegister => write!(f, "Holding Register"),
        }
    }
}

/// How to interpret raw 16-bit register values.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ModbusDataType {
    Bool,
    U16,
    I16,
    U32,
    I32,
    F32,
}

impl fmt::Display for ModbusDataType {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::Bool => write!(f, "Bool"),
            Self::U16 => write!(f, "U16"),
            Self::I16 => write!(f, "I16"),
            Self::U32 => write!(f, "U32"),
            Self::I32 => write!(f, "I32"),
            Self::F32 => write!(f, "F32"),
        }
    }
}

// ─── Read / Write Types ──────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RegisterReadRequest {
    pub register_type: RegisterType,
    pub start_address: u16,
    pub count: u16,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RegisterValue {
    pub address: u16,
    pub register_type: RegisterType,
    /// String-encoded value (e.g. "true", "12345", "22.5")
    pub value: String,
    pub raw: Vec<u16>,
    pub timestamp: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RegisterWriteRequest {
    /// Must be `Coil` or `HoldingRegister`
    pub register_type: RegisterType,
    pub start_address: u16,
    /// String-encoded values, parsed according to `data_type`
    pub values: Vec<String>,
    pub data_type: ModbusDataType,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RegisterWriteResult {
    pub address: u16,
    pub success: bool,
    pub error: Option<String>,
}

// ─── Monitor Types ───────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MonitorRequest {
    pub register_type: RegisterType,
    pub start_address: u16,
    pub count: u16,
    pub data_type: ModbusDataType,
    /// Optional user-friendly label for this monitor entry.
    pub label: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MonitoredRegister {
    pub id: u32,
    pub register_type: RegisterType,
    pub start_address: u16,
    pub count: u16,
    pub data_type: ModbusDataType,
    pub label: String,
    pub latest_values: Vec<RegisterValue>,
    pub read_count: u64,
    pub error_count: u64,
    pub last_error: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ModbusPollResponse {
    pub monitors: Vec<MonitoredRegister>,
    pub poll_duration_ms: u64,
}

// ─── Tests ───────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn register_type_display() {
        assert_eq!(RegisterType::Coil.to_string(), "Coil");
        assert_eq!(RegisterType::DiscreteInput.to_string(), "Discrete Input");
        assert_eq!(RegisterType::InputRegister.to_string(), "Input Register");
        assert_eq!(
            RegisterType::HoldingRegister.to_string(),
            "Holding Register"
        );
    }

    #[test]
    fn connection_config_serde_roundtrip() {
        let config = ModbusConnectionConfig {
            name: "Test".to_string(),
            host: "192.168.1.100".to_string(),
            port: 502,
            unit_id: 1,
            use_simulator: false,
            timeout_ms: Some(3000),
        };
        let json = serde_json::to_string(&config).unwrap();
        let parsed: ModbusConnectionConfig = serde_json::from_str(&json).unwrap();
        assert_eq!(parsed.name, "Test");
        assert_eq!(parsed.port, 502);
        assert_eq!(parsed.unit_id, 1);
    }

    #[test]
    fn register_type_serde() {
        let json = serde_json::to_string(&RegisterType::HoldingRegister).unwrap();
        assert_eq!(json, "\"holding_register\"");
        let parsed: RegisterType = serde_json::from_str(&json).unwrap();
        assert_eq!(parsed, RegisterType::HoldingRegister);
    }

    #[test]
    fn data_type_serde() {
        let json = serde_json::to_string(&ModbusDataType::F32).unwrap();
        assert_eq!(json, "\"f32\"");
        let parsed: ModbusDataType = serde_json::from_str(&json).unwrap();
        assert_eq!(parsed, ModbusDataType::F32);
    }
}
