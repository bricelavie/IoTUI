import React, { useState, useCallback } from "react";
import { useModbusConnectionStore } from "@/stores/modbusConnectionStore";
import { useModbusRegisterStore } from "@/stores/modbusRegisterStore";
import { Button, Input, Select, EmptyState, Tooltip } from "@/components/ui";
import { toast } from "@/stores/notificationStore";
import { errorMessage } from "@/utils/errors";
import { registerTypeLabel, formatModbusAddress, isWritableRegister } from "@/utils/modbus";
import type { RegisterType, ModbusDataType, RegisterWriteRequest } from "@/types/modbus";
import {
  Search, Database, Edit3, RefreshCw, Copy, AlertCircle,
} from "lucide-react";

// ─── Constants ───────────────────────────────────────────────────

const REGISTER_TYPE_OPTIONS = [
  { value: "coil", label: "Coil (FC01)" },
  { value: "discrete_input", label: "Discrete Input (FC02)" },
  { value: "holding_register", label: "Holding Register (FC03)" },
  { value: "input_register", label: "Input Register (FC04)" },
];

const DATA_TYPE_OPTIONS = [
  { value: "u16", label: "Unsigned 16-bit" },
  { value: "i16", label: "Signed 16-bit" },
  { value: "u32", label: "Unsigned 32-bit" },
  { value: "i32", label: "Signed 32-bit" },
  { value: "f32", label: "Float 32-bit" },
  { value: "bool", label: "Boolean" },
];

// ─── Component ───────────────────────────────────────────────────

export const RegisterBrowser: React.FC = () => {
  const { activeConnectionId } = useModbusConnectionStore();
  const {
    values, isReading, readError,
    registerType, startAddress, count, dataType,
    setRegisterType, setStartAddress, setCount, setDataType,
    readRegisters, clearErrors,
  } = useModbusRegisterStore();

  // Write mode state
  const [writeMode, setWriteMode] = useState(false);
  const [writeValues, setWriteValues] = useState<Record<number, string>>({});
  const [isWriting, setIsWriting] = useState(false);

  const handleRead = useCallback(() => {
    if (!activeConnectionId) return;
    clearErrors();
    readRegisters(activeConnectionId);
  }, [activeConnectionId, clearErrors, readRegisters]);

  const handleCopyValue = useCallback(async (address: number, value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      toast.success("Copied", `Address ${address}: ${value}`);
    } catch {
      toast.error("Copy failed", "Could not access clipboard");
    }
  }, []);

  const handleWriteSubmit = useCallback(async () => {
    if (!activeConnectionId) return;
    const entries = Object.entries(writeValues).filter(([, v]) => v.trim() !== "");
    if (entries.length === 0) {
      toast.error("No values", "Enter at least one value to write");
      return;
    }

    // Write each address individually for simplicity
    setIsWriting(true);
    try {
      const { writeRegisters } = useModbusRegisterStore.getState();
      for (const [addrStr, val] of entries) {
        const addr = Number(addrStr);
        const request: RegisterWriteRequest = {
          register_type: registerType as "coil" | "holding_register",
          start_address: addr,
          values: [val],
          data_type: dataType,
        };
        await writeRegisters(activeConnectionId, request);
      }
      setWriteValues({});
      // Re-read to see updated values
      readRegisters(activeConnectionId);
    } catch (err) {
      toast.error("Write Failed", errorMessage(err));
    } finally {
      setIsWriting(false);
    }
  }, [activeConnectionId, writeValues, registerType, dataType, readRegisters]);

  if (!activeConnectionId) {
    return (
      <div className="h-full flex items-center justify-center">
        <EmptyState
          icon={<Database size={32} />}
          title="No Connection Selected"
          description="Connect to a Modbus device to browse registers"
        />
      </div>
    );
  }

  const canWrite = isWritableRegister(registerType);

  return (
    <div className="h-full flex flex-col">
      {/* Header / Controls */}
      <div className="flex-shrink-0 px-4 py-3 border-b border-iot-border space-y-3">
        <div className="flex items-center gap-2">
          <Database size={14} className="text-iot-cyan" />
          <span className="text-xs font-semibold text-iot-text-secondary uppercase tracking-wider">
            Register Browser
          </span>
        </div>
        <div className="flex items-end gap-3 flex-wrap">
          <div className="w-48">
            <Select
              label="Register Type"
              options={REGISTER_TYPE_OPTIONS}
              value={registerType}
              onChange={(e) => setRegisterType(e.target.value as RegisterType)}
            />
          </div>
          <div className="w-28">
            <Input
              label="Start Address"
              type="number"
              value={String(startAddress)}
              onChange={(e) => setStartAddress(Number(e.target.value) || 0)}
              min="0"
              max="65535"
            />
          </div>
          <div className="w-20">
            <Input
              label="Count"
              type="number"
              value={String(count)}
              onChange={(e) => setCount(Number(e.target.value) || 1)}
              min="1"
              max="125"
            />
          </div>
          <div className="w-40">
            <Select
              label="Data Type"
              options={DATA_TYPE_OPTIONS}
              value={dataType}
              onChange={(e) => setDataType(e.target.value as ModbusDataType)}
            />
          </div>
          <Button variant="primary" size="sm" onClick={handleRead} loading={isReading}>
            <Search size={12} />
            Read
          </Button>
          {canWrite && (
            <Button
              variant={writeMode ? "accent" : "ghost"}
              size="sm"
              onClick={() => setWriteMode(!writeMode)}
            >
              <Edit3 size={12} />
              {writeMode ? "Cancel Write" : "Write"}
            </Button>
          )}
        </div>
      </div>

      {/* Error */}
      {readError && (
        <div className="flex items-center gap-2 px-4 py-2 bg-iot-red/10 border-b border-iot-red/20">
          <AlertCircle size={14} className="text-iot-red flex-shrink-0" />
          <span className="text-xs text-iot-red flex-1">{readError}</span>
        </div>
      )}

      {/* Results Table */}
      <div className="flex-1 overflow-auto">
        {values.length === 0 ? (
          <div className="h-full flex items-center justify-center">
            <EmptyState
              icon={<Search size={28} />}
              title="No Data"
              description="Configure the register range above and click Read"
            />
          </div>
        ) : (
          <table className="w-full text-xs">
            <thead className="bg-iot-bg-surface sticky top-0">
              <tr className="border-b border-iot-border">
                <th className="text-left px-4 py-2 text-iot-text-secondary font-medium">Address</th>
                <th className="text-left px-4 py-2 text-iot-text-secondary font-medium">Modbus Addr</th>
                <th className="text-left px-4 py-2 text-iot-text-secondary font-medium">Type</th>
                <th className="text-left px-4 py-2 text-iot-text-secondary font-medium">Value</th>
                <th className="text-left px-4 py-2 text-iot-text-secondary font-medium">Raw</th>
                <th className="text-left px-4 py-2 text-iot-text-secondary font-medium">Timestamp</th>
                <th className="w-16 px-4 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {values.map((v) => (
                <tr
                  key={`${v.register_type}-${v.address}`}
                  className="border-b border-iot-border/30 hover:bg-iot-bg-hover transition-colors"
                >
                  <td className="px-4 py-2 font-mono text-iot-text-primary">{v.address}</td>
                  <td className="px-4 py-2 font-mono text-iot-text-muted">
                    {formatModbusAddress(v.register_type, v.address)}
                  </td>
                  <td className="px-4 py-2 text-iot-text-secondary">{registerTypeLabel(v.register_type)}</td>
                  <td className="px-4 py-2 font-mono font-semibold text-iot-text-primary">
                    {writeMode && canWrite ? (
                      <Input
                        type="text"
                        className="w-24 !py-0.5 text-xs font-mono"
                        placeholder={v.value}
                        value={writeValues[v.address] ?? ""}
                        onChange={(e) => setWriteValues((prev) => ({ ...prev, [v.address]: e.target.value }))}
                      />
                    ) : (
                      v.value
                    )}
                  </td>
                  <td className="px-4 py-2 font-mono text-iot-text-disabled text-2xs">
                    [{v.raw.map((r) => `0x${r.toString(16).padStart(4, "0")}`).join(", ")}]
                  </td>
                  <td className="px-4 py-2 text-iot-text-disabled text-2xs">
                    {new Date(v.timestamp).toLocaleTimeString()}
                  </td>
                  <td className="px-4 py-2">
                    <Tooltip content="Copy value">
                      <button
                        onClick={() => handleCopyValue(v.address, v.value)}
                        aria-label={`Copy value for address ${v.address}`}
                        className="text-iot-text-disabled hover:text-iot-text-secondary transition-colors rounded p-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-iot-border-focus"
                      >
                        <Copy size={12} />
                      </button>
                    </Tooltip>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Write submit bar */}
      {writeMode && canWrite && (
        <div className="flex-shrink-0 px-4 py-2 border-t border-iot-border flex items-center justify-between bg-iot-bg-surface">
          <span className="text-xs text-iot-text-muted">
            Enter new values in the Value column, then click Write All
          </span>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={() => { setWriteMode(false); setWriteValues({}); }}>
              Cancel
            </Button>
            <Button variant="primary" size="sm" onClick={handleWriteSubmit} loading={isWriting}>
              <RefreshCw size={12} />
              Write All
            </Button>
          </div>
        </div>
      )}
    </div>
  );
};
