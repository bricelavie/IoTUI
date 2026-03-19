import { invoke } from "@tauri-apps/api/core";
import { withLogging } from "@/services/logger";
import type {
  ModbusConnectionConfig,
  ModbusConnectionInfo,
  ModbusConnectionStatus,
  RegisterReadRequest,
  RegisterValue,
  RegisterWriteRequest,
  RegisterWriteResult,
  MonitorRequest,
  MonitoredRegister,
  ModbusPollResponse,
} from "@/types/modbus";

// ─── Connection ──────────────────────────────────────────────────

export const modbusConnect = withLogging(
  "modbus_connect",
  async (config: ModbusConnectionConfig): Promise<string> => {
    return invoke("modbus_connect", { config });
  }
);

export const modbusDisconnect = withLogging(
  "modbus_disconnect",
  async (connectionId: string): Promise<void> => {
    return invoke("modbus_disconnect", { connectionId });
  }
);

export const modbusGetConnections = withLogging(
  "modbus_get_connections",
  async (): Promise<ModbusConnectionInfo[]> => {
    return invoke("modbus_get_connections");
  }
);

export const modbusGetConnectionStatus = withLogging(
  "modbus_get_connection_status",
  async (connectionId: string): Promise<ModbusConnectionStatus> => {
    return invoke("modbus_get_connection_status", { connectionId });
  }
);

// ─── Register Read / Write ───────────────────────────────────────

export const modbusReadRegisters = withLogging(
  "modbus_read_registers",
  async (connectionId: string, request: RegisterReadRequest): Promise<RegisterValue[]> => {
    return invoke("modbus_read_registers", { connectionId, request });
  }
);

export const modbusWriteRegisters = withLogging(
  "modbus_write_registers",
  async (connectionId: string, request: RegisterWriteRequest): Promise<RegisterWriteResult[]> => {
    return invoke("modbus_write_registers", { connectionId, request });
  }
);

// ─── Monitor ─────────────────────────────────────────────────────

export const modbusAddMonitor = withLogging(
  "modbus_add_monitor",
  async (connectionId: string, request: MonitorRequest): Promise<MonitoredRegister> => {
    return invoke("modbus_add_monitor", { connectionId, request });
  }
);

export const modbusRemoveMonitor = withLogging(
  "modbus_remove_monitor",
  async (connectionId: string, monitorId: number): Promise<void> => {
    return invoke("modbus_remove_monitor", { connectionId, monitorId });
  }
);

export const modbusGetMonitors = withLogging(
  "modbus_get_monitors",
  async (connectionId: string): Promise<MonitoredRegister[]> => {
    return invoke("modbus_get_monitors", { connectionId });
  }
);

export const modbusPollMonitors = withLogging(
  "modbus_poll_monitors",
  async (connectionId: string): Promise<ModbusPollResponse> => {
    return invoke("modbus_poll_monitors", { connectionId });
  }
);
