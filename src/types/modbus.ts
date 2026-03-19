// ─── Connection Types ────────────────────────────────────────────

export type ModbusConnectionStatus =
  | "disconnected"
  | "connecting"
  | "connected"
  | "error";

export interface ModbusConnectionConfig {
  name: string;
  host: string;
  port: number;
  /** Modbus slave/unit ID (1–247, 0 = broadcast) */
  unit_id: number;
  /** When true, use the built-in simulator instead of connecting to a real device. */
  use_simulator: boolean;
  /** Per-request timeout in milliseconds. */
  timeout_ms?: number | null;
}

export interface ModbusConnectionInfo {
  id: string;
  name: string;
  host: string;
  port: number;
  unit_id: number;
  status: ModbusConnectionStatus;
  is_simulator: boolean;
  last_error?: string | null;
}

// ─── Register Types ──────────────────────────────────────────────

export type RegisterType =
  | "coil"
  | "discrete_input"
  | "input_register"
  | "holding_register";

export type ModbusDataType = "bool" | "u16" | "i16" | "u32" | "i32" | "f32";

// ─── Read / Write Types ──────────────────────────────────────────

export interface RegisterReadRequest {
  register_type: RegisterType;
  start_address: number;
  count: number;
}

export interface RegisterValue {
  address: number;
  register_type: RegisterType;
  /** String-encoded value (e.g. "true", "12345", "22.5") */
  value: string;
  raw: number[];
  timestamp: string;
}

export interface RegisterWriteRequest {
  /** Must be "coil" or "holding_register" */
  register_type: "coil" | "holding_register";
  start_address: number;
  /** String-encoded values, parsed according to data_type */
  values: string[];
  data_type: ModbusDataType;
}

export interface RegisterWriteResult {
  address: number;
  success: boolean;
  error?: string | null;
}

// ─── Monitor Types ───────────────────────────────────────────────

export interface MonitorRequest {
  register_type: RegisterType;
  start_address: number;
  count: number;
  data_type: ModbusDataType;
  /** Optional user-friendly label for this monitor entry. */
  label?: string | null;
}

export interface MonitoredRegister {
  id: number;
  register_type: RegisterType;
  start_address: number;
  count: number;
  data_type: ModbusDataType;
  label: string;
  latest_values: RegisterValue[];
  read_count: number;
  error_count: number;
  last_error?: string | null;
}

export interface ModbusPollResponse {
  monitors: MonitoredRegister[];
  poll_duration_ms: number;
}
