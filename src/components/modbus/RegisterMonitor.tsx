import React, { useState, useCallback } from "react";
import { useModbusConnectionStore } from "@/stores/modbusConnectionStore";
import { useModbusMonitorStore } from "@/stores/modbusMonitorStore";
import { Button, Input, Select, Card, Badge, EmptyState, Tooltip } from "@/components/ui";
import {
  registerTypeLabel, dataTypeLabel, formatModbusAddress, formatTimestamp,
  SIMULATOR_REGISTER_PRESETS,
} from "@/utils/modbus";
import type { RegisterType, ModbusDataType, MonitorRequest } from "@/types/modbus";
import {
  Activity, Plus, Trash2, Play, Square, AlertCircle, Zap,
} from "lucide-react";

// ─── Constants ───────────────────────────────────────────────────

const REGISTER_TYPE_OPTIONS = [
  { value: "coil", label: "Coil" },
  { value: "discrete_input", label: "Discrete Input" },
  { value: "holding_register", label: "Holding Register" },
  { value: "input_register", label: "Input Register" },
];

const DATA_TYPE_OPTIONS = [
  { value: "u16", label: "U16" },
  { value: "i16", label: "I16" },
  { value: "u32", label: "U32" },
  { value: "i32", label: "I32" },
  { value: "f32", label: "F32" },
  { value: "bool", label: "Bool" },
];

// ─── Component ───────────────────────────────────────────────────

export const RegisterMonitor: React.FC = () => {
  const activeConnectionId = useModbusConnectionStore((s) => s.activeConnectionId);
  const connections = useModbusConnectionStore((s) => s.connections);
  const monitors = useModbusMonitorStore((s) => s.monitors);
  const isPolling = useModbusMonitorStore((s) => s.isPolling);
  const pollError = useModbusMonitorStore((s) => s.pollError);
  const lastPollDurationMs = useModbusMonitorStore((s) => s.lastPollDurationMs);
  const addMonitor = useModbusMonitorStore((s) => s.addMonitor);
  const removeMonitor = useModbusMonitorStore((s) => s.removeMonitor);
  const startPolling = useModbusMonitorStore((s) => s.startPolling);
  const stopPolling = useModbusMonitorStore((s) => s.stopPolling);

  // Add monitor form
  const [showAddForm, setShowAddForm] = useState(false);
  const [newRegType, setNewRegType] = useState<RegisterType>("input_register");
  const [newStart, setNewStart] = useState("0");
  const [newCount, setNewCount] = useState("10");
  const [newDataType, setNewDataType] = useState<ModbusDataType>("f32");
  const [newLabel, setNewLabel] = useState("");

  const activeConn = connections.find((c) => c.id === activeConnectionId);
  const isSimulator = activeConn?.is_simulator ?? false;

  const handleAddMonitor = useCallback(async () => {
    if (!activeConnectionId) return;
    const request: MonitorRequest = {
      register_type: newRegType,
      start_address: Number(newStart) || 0,
      count: Number(newCount) || 1,
      data_type: newDataType,
      label: newLabel.trim() || null,
    };
    try {
      await addMonitor(activeConnectionId, request);
      setShowAddForm(false);
      setNewLabel("");
    } catch (e) {
      // error handled by store
    }
  }, [activeConnectionId, newRegType, newStart, newCount, newDataType, newLabel, addMonitor]);

  const handleAddPreset = useCallback(async (preset: typeof SIMULATOR_REGISTER_PRESETS[number]) => {
    if (!activeConnectionId) return;
    const request: MonitorRequest = {
      register_type: preset.type,
      start_address: preset.start,
      count: preset.count,
      data_type: preset.dataType,
      label: preset.label,
    };
    try {
      await addMonitor(activeConnectionId, request);
    } catch (e) {
      // error handled by store
    }
  }, [activeConnectionId, addMonitor]);

  const handleRemoveMonitor = useCallback(async (monitorId: number) => {
    if (!activeConnectionId) return;
    try {
      await removeMonitor(activeConnectionId, monitorId);
    } catch (e) {
      // error handled by store
    }
  }, [activeConnectionId, removeMonitor]);

  const handleTogglePolling = useCallback(() => {
    if (!activeConnectionId) return;
    if (isPolling) {
      stopPolling();
    } else {
      startPolling(activeConnectionId);
    }
  }, [activeConnectionId, isPolling, startPolling, stopPolling]);

  if (!activeConnectionId) {
    return (
      <div className="h-full flex items-center justify-center">
        <EmptyState
          icon={<Activity size={32} />}
          title="No Connection Selected"
          description="Connect to a Modbus device to monitor registers"
        />
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="flex-shrink-0 px-4 py-3 border-b border-iot-border">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Activity size={14} className="text-iot-cyan" />
            <span className="text-xs font-semibold text-iot-text-secondary uppercase tracking-wider">
              Register Monitor
            </span>
            <Badge variant={isPolling ? "success" : "default"}>
              {isPolling ? "Polling" : "Stopped"}
            </Badge>
            {monitors.length > 0 && (
              <Badge variant="info">{monitors.length} monitors</Badge>
            )}
            {lastPollDurationMs != null && isPolling && (
              <span className="text-2xs text-iot-text-disabled font-mono">
                {lastPollDurationMs}ms
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            {monitors.length > 0 && (
              <Button
                variant={isPolling ? "danger" : "primary"}
                size="sm"
                onClick={handleTogglePolling}
              >
                {isPolling ? <Square size={12} /> : <Play size={12} />}
                {isPolling ? "Stop" : "Start"}
              </Button>
            )}
            <Button variant="ghost" size="sm" onClick={() => setShowAddForm(!showAddForm)}>
              <Plus size={12} />
              Add Monitor
            </Button>
          </div>
        </div>
      </div>

      {/* Poll error */}
      {pollError && (
        <div className="flex items-center gap-2 px-4 py-2 bg-iot-red/10 border-b border-iot-red/20">
          <AlertCircle size={14} className="text-iot-red flex-shrink-0" />
          <span className="text-xs text-iot-red flex-1">{pollError}</span>
        </div>
      )}

      {/* Add monitor form */}
      {showAddForm && (
        <div className="flex-shrink-0 px-4 py-3 border-b border-iot-border bg-iot-bg-surface space-y-3">
          <div className="flex items-end gap-3 flex-wrap">
            <div className="w-40">
              <Select
                label="Register Type"
                options={REGISTER_TYPE_OPTIONS}
                value={newRegType}
                onChange={(e) => setNewRegType(e.target.value as RegisterType)}
              />
            </div>
            <div className="w-24">
              <Input
                label="Start"
                type="number"
                value={newStart}
                onChange={(e) => setNewStart(e.target.value)}
                min="0"
                max="65535"
              />
            </div>
            <div className="w-20">
              <Input
                label="Count"
                type="number"
                value={newCount}
                onChange={(e) => setNewCount(e.target.value)}
                min="1"
                max="125"
              />
            </div>
            <div className="w-28">
              <Select
                label="Data Type"
                options={DATA_TYPE_OPTIONS}
                value={newDataType}
                onChange={(e) => setNewDataType(e.target.value as ModbusDataType)}
              />
            </div>
            <div className="w-40">
              <Input
                label="Label (optional)"
                value={newLabel}
                onChange={(e) => setNewLabel(e.target.value)}
                placeholder="Temperature"
              />
            </div>
            <Button variant="primary" size="sm" onClick={handleAddMonitor}>
              <Plus size={12} />
              Add
            </Button>
          </div>

          {/* Quick presets for simulator */}
          {isSimulator && (
            <div>
              <span className="text-2xs text-iot-text-disabled uppercase tracking-wider">Quick Presets</span>
              <div className="flex flex-wrap gap-1.5 mt-1">
                {SIMULATOR_REGISTER_PRESETS.map((preset) => (
                  <button
                    key={preset.label}
                    onClick={() => handleAddPreset(preset)}
                    className="px-2 py-1 text-2xs rounded bg-iot-bg-base border border-iot-border hover:border-iot-cyan/30 hover:bg-iot-cyan/5 text-iot-text-secondary transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-iot-border-focus"
                  >
                    <Zap size={10} className="inline mr-1 text-iot-cyan" />
                    {preset.label}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Monitor Cards */}
      <div className="flex-1 overflow-auto p-4">
        {monitors.length === 0 ? (
          <div className="h-full flex items-center justify-center">
            <EmptyState
              icon={<Activity size={28} />}
              title="No Monitors"
              description="Add register monitors to start polling live data"
              action={
                <Button variant="primary" size="sm" onClick={() => setShowAddForm(true)}>
                  <Plus size={12} />
                  Add Monitor
                </Button>
              }
            />
          </div>
        ) : (
          <div className="space-y-4">
            {monitors.map((monitor) => {
              const hasError = !!monitor.last_error;
              return (
                <Card
                  key={monitor.id}
                  className="overflow-hidden"
                  glow={hasError ? "red" : isPolling ? "cyan" : undefined}
                >
                  {/* Monitor header */}
                  <div className="flex items-center justify-between px-4 py-2 border-b border-iot-border/30">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="text-sm font-medium text-iot-text-primary truncate">
                        {monitor.label}
                      </span>
                      <Badge variant="default">
                        {registerTypeLabel(monitor.register_type)}
                      </Badge>
                      <span className="text-2xs text-iot-text-disabled font-mono">
                        {monitor.start_address}–{monitor.start_address + monitor.count - 1}
                      </span>
                      <Badge variant="info">{dataTypeLabel(monitor.data_type)}</Badge>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <span className="text-2xs text-iot-text-disabled font-mono">
                        {monitor.read_count} reads
                        {monitor.error_count > 0 && (
                          <span className="text-iot-red ml-1">{monitor.error_count} err</span>
                        )}
                      </span>
                      <Tooltip content="Remove monitor">
                        <button
                          onClick={() => handleRemoveMonitor(monitor.id)}
                          aria-label={`Remove monitor ${monitor.label}`}
                          className="text-iot-text-disabled hover:text-iot-red transition-colors p-1 rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-iot-border-focus"
                        >
                          <Trash2 size={12} />
                        </button>
                      </Tooltip>
                    </div>
                  </div>

                  {/* Monitor error */}
                  {hasError && (
                    <div className="flex items-center gap-2 px-4 py-1.5 bg-iot-red/5">
                      <AlertCircle size={12} className="text-iot-red" />
                      <span className="text-2xs text-iot-red">{monitor.last_error}</span>
                    </div>
                  )}

                  {/* Values table */}
                  {monitor.latest_values.length > 0 ? (
                    <div className="overflow-auto max-h-48">
                      <table className="w-full text-xs">
                        <thead className="bg-iot-bg-surface">
                          <tr className="border-b border-iot-border/30">
                            <th className="text-left px-4 py-1.5 text-iot-text-secondary font-medium">Address</th>
                            <th className="text-left px-4 py-1.5 text-iot-text-secondary font-medium">Value</th>
                            <th className="text-left px-4 py-1.5 text-iot-text-secondary font-medium">Raw</th>
                            <th className="text-left px-4 py-1.5 text-iot-text-secondary font-medium">Time</th>
                          </tr>
                        </thead>
                        <tbody>
                          {monitor.latest_values.map((v) => (
                            <tr
                              key={v.address}
                              className="border-b border-iot-border/20 hover:bg-iot-bg-hover transition-colors"
                            >
                              <td className="px-4 py-1 font-mono text-iot-text-muted">
                                {formatModbusAddress(v.register_type, v.address)}
                              </td>
                              <td className="px-4 py-1 font-mono font-semibold text-iot-text-primary">
                                {v.value}
                              </td>
                              <td className="px-4 py-1 font-mono text-iot-text-disabled text-2xs">
                                {v.raw.map((r) => `0x${r.toString(16).padStart(4, "0")}`).join(" ")}
                              </td>
                              <td className="px-4 py-1 text-iot-text-disabled text-2xs">
                                {formatTimestamp(v.timestamp)}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    <div className="px-4 py-3 text-xs text-iot-text-disabled text-center">
                      Waiting for poll data...
                    </div>
                  )}
                </Card>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};
