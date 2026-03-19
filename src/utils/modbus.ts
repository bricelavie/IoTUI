import type { RegisterType, ModbusDataType, ModbusConnectionStatus, RegisterValue, MonitoredRegister } from "@/types/modbus";

// ─── Register Type Display ───────────────────────────────────────

const REGISTER_TYPE_LABELS: Record<RegisterType, string> = {
  coil: "Coil",
  discrete_input: "Discrete Input",
  input_register: "Input Register",
  holding_register: "Holding Register",
};

export function registerTypeLabel(rt: RegisterType): string {
  return REGISTER_TYPE_LABELS[rt] ?? rt;
}

export function isWritableRegister(rt: RegisterType): boolean {
  return rt === "coil" || rt === "holding_register";
}

// ─── Data Type Display ───────────────────────────────────────────

const DATA_TYPE_LABELS: Record<ModbusDataType, string> = {
  bool: "Boolean",
  u16: "Unsigned 16-bit",
  i16: "Signed 16-bit",
  u32: "Unsigned 32-bit",
  i32: "Signed 32-bit",
  f32: "Float 32-bit",
};

export function dataTypeLabel(dt: ModbusDataType): string {
  return DATA_TYPE_LABELS[dt] ?? dt;
}

/** Number of 16-bit registers consumed by a data type. */
export function registersPerValue(dt: ModbusDataType): number {
  switch (dt) {
    case "u32":
    case "i32":
    case "f32":
      return 2;
    default:
      return 1;
  }
}

// ─── Timestamp Formatting ────────────────────────────────────────

export function formatTimestamp(ts: string): string {
  try {
    return new Date(ts).toLocaleTimeString();
  } catch {
    return ts;
  }
}

export function formatTimestampFull(ts: string): string {
  try {
    return new Date(ts).toLocaleString();
  } catch {
    return ts;
  }
}

// ─── Numeric Parsing ─────────────────────────────────────────────

/** Parse a register value's string representation into a numeric value, or undefined. */
export function parseNumericValue(val: RegisterValue): number | undefined {
  const n = Number(val.value);
  return Number.isFinite(n) ? n : undefined;
}

// ─── Clipboard ───────────────────────────────────────────────────

export async function copyToClipboard(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

// ─── Export Helpers ──────────────────────────────────────────────

/** Escape a value for CSV: wrap in quotes if it contains comma, quote, or newline */
function csvEscape(val: string | number | undefined | null): string {
  const s = val == null ? "" : String(val);
  if (s.includes(",") || s.includes('"') || s.includes("\n") || s.includes("\r")) {
    return '"' + s.replace(/"/g, '""') + '"';
  }
  return s;
}

export function exportRegistersAsJson(values: RegisterValue[]): string {
  return JSON.stringify(
    values.map((v) => ({
      address: v.address,
      register_type: v.register_type,
      value: v.value,
      raw: v.raw,
      timestamp: v.timestamp,
    })),
    null,
    2
  );
}

export function exportRegistersAsCsv(values: RegisterValue[]): string {
  const header = "timestamp,address,register_type,value,raw";
  const rows = values.map((v) => {
    const rawStr = v.raw.join(";");
    return `${csvEscape(v.timestamp)},${v.address},${csvEscape(v.register_type)},${csvEscape(v.value)},${csvEscape(rawStr)}`;
  });
  return [header, ...rows].join("\n");
}

export function exportMonitorsAsJson(monitors: MonitoredRegister[]): string {
  return JSON.stringify(
    monitors.map((m) => ({
      id: m.id,
      label: m.label,
      register_type: m.register_type,
      start_address: m.start_address,
      count: m.count,
      data_type: m.data_type,
      read_count: m.read_count,
      error_count: m.error_count,
      latest_values: m.latest_values,
    })),
    null,
    2
  );
}

export function downloadFile(content: string, filename: string, mimeType: string) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.style.display = "none";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// ─── Address Formatting ──────────────────────────────────────────

/** Format a Modbus address with zero-padded 5-digit notation (e.g. "40001"). */
export function formatModbusAddress(rt: RegisterType, address: number): string {
  switch (rt) {
    case "coil":
      return `0${String(address + 1).padStart(4, "0")}`;
    case "discrete_input":
      return `1${String(address + 1).padStart(4, "0")}`;
    case "input_register":
      return `3${String(address + 1).padStart(4, "0")}`;
    case "holding_register":
      return `4${String(address + 1).padStart(4, "0")}`;
    default:
      return String(address);
  }
}

// ─── Status Display ──────────────────────────────────────────────

export function connectionStatusColor(status: ModbusConnectionStatus): string {
  switch (status) {
    case "connected":
      return "var(--color-success)";
    case "connecting":
      return "var(--color-warning)";
    case "error":
      return "var(--color-error)";
    default:
      return "var(--color-text-secondary)";
  }
}

// ─── Simulator Defaults ──────────────────────────────────────────

/** Default register address presets for the simulator. */
export const SIMULATOR_REGISTER_PRESETS = [
  { label: "Temperature Sensors", type: "input_register" as RegisterType, start: 0, count: 10, dataType: "f32" as ModbusDataType },
  { label: "Pressure Sensors", type: "input_register" as RegisterType, start: 20, count: 10, dataType: "f32" as ModbusDataType },
  { label: "Flow Rates", type: "input_register" as RegisterType, start: 40, count: 6, dataType: "f32" as ModbusDataType },
  { label: "Motor Controls", type: "coil" as RegisterType, start: 0, count: 8, dataType: "bool" as ModbusDataType },
  { label: "Limit Switches", type: "discrete_input" as RegisterType, start: 0, count: 16, dataType: "bool" as ModbusDataType },
  { label: "PID Setpoints", type: "holding_register" as RegisterType, start: 100, count: 10, dataType: "f32" as ModbusDataType },
  { label: "Alarm Thresholds", type: "holding_register" as RegisterType, start: 200, count: 10, dataType: "f32" as ModbusDataType },
] as const;
