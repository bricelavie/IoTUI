import React, { useCallback, useState, useMemo } from "react";
import { useModbusConnectionStore } from "@/stores/modbusConnectionStore";
import { useModbusMonitorStore } from "@/stores/modbusMonitorStore";
import { useModbusRegisterStore } from "@/stores/modbusRegisterStore";
import { Button, Select, Card, Badge, EmptyState } from "@/components/ui";
import { toast } from "@/stores/notificationStore";
import {
  exportRegistersAsJson, exportRegistersAsCsv,
  exportMonitorsAsJson, downloadFile,
} from "@/utils/modbus";
import { Download, FileText, Database, Activity, Copy, Check } from "lucide-react";

// ─── Constants ───────────────────────────────────────────────────

const FORMAT_OPTIONS = [
  { value: "json", label: "JSON" },
  { value: "csv", label: "CSV" },
];

// ─── Component ───────────────────────────────────────────────────

export const ModbusDataExport: React.FC = () => {
  const { activeConnectionId, connections } = useModbusConnectionStore();
  const { monitors } = useModbusMonitorStore();
  const { values } = useModbusRegisterStore();

  const [format, setFormat] = useState<"json" | "csv">("json");
  const [copied, setCopied] = useState(false);

  const activeConn = connections.find((c) => c.id === activeConnectionId);
  const hasRegisterData = values.length > 0;
  const hasMonitorData = monitors.some((m) => m.latest_values.length > 0);

  // Generate export content for preview + copy
  const exportContent = useMemo(() => {
    if (values.length === 0) return "";
    if (format === "json") return exportRegistersAsJson(values);
    return exportRegistersAsCsv(values);
  }, [values, format]);

  // Stats
  const totalMonitorValues = monitors.reduce(
    (sum, m) => sum + m.latest_values.length, 0
  );
  const totalReadCount = monitors.reduce((sum, m) => sum + m.read_count, 0);

  const handleExportRegisters = useCallback(() => {
    if (values.length === 0) {
      toast.error("No Data", "Read some registers first");
      return;
    }
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    if (format === "json") {
      downloadFile(
        exportRegistersAsJson(values),
        `modbus-registers-${timestamp}.json`,
        "application/json"
      );
    } else {
      downloadFile(
        exportRegistersAsCsv(values),
        `modbus-registers-${timestamp}.csv`,
        "text/csv"
      );
    }
    toast.success("Exported", `${values.length} register values`);
  }, [values, format]);

  const handleExportMonitors = useCallback(() => {
    if (!hasMonitorData) {
      toast.error("No Data", "Start polling monitors first");
      return;
    }
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    downloadFile(
      exportMonitorsAsJson(monitors),
      `modbus-monitors-${timestamp}.json`,
      "application/json"
    );
    toast.success("Exported", `${monitors.length} monitor snapshots`);
  }, [monitors, hasMonitorData]);

  const handleCopy = useCallback(async () => {
    if (!exportContent) return;
    try {
      await navigator.clipboard.writeText(exportContent);
      setCopied(true);
      toast.success("Copied to clipboard");
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("Copy failed", "Could not access clipboard");
    }
  }, [exportContent]);

  if (!activeConnectionId) {
    return (
      <div className="h-full flex items-center justify-center">
        <EmptyState
          icon={<Download size={32} />}
          title="No Connection Selected"
          description="Connect to a Modbus device to export data"
        />
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="flex items-center gap-2 px-4 py-3 border-b border-iot-border flex-shrink-0">
        <Download size={14} className="text-iot-cyan" />
        <span className="text-xs font-semibold text-iot-text-secondary uppercase tracking-wider">
          Data Export
        </span>
        {activeConn && (
          <Badge variant="default">{activeConn.name}</Badge>
        )}
      </div>

      {/* Export options */}
      <div className="flex-1 overflow-auto p-4">
        <div className="max-w-2xl mx-auto space-y-6">
          {/* Stats Grid */}
          <div className="grid grid-cols-3 gap-3">
            <div className="bg-iot-bg-surface border border-iot-border rounded-lg p-3">
              <span className="data-label">Register Values</span>
              <p className="text-lg font-semibold text-iot-text-primary font-mono mt-1">
                {values.length}
              </p>
            </div>
            <div className="bg-iot-bg-surface border border-iot-border rounded-lg p-3">
              <span className="data-label">Monitor Values</span>
              <p className="text-lg font-semibold text-iot-text-primary font-mono mt-1">
                {totalMonitorValues}
              </p>
            </div>
            <div className="bg-iot-bg-surface border border-iot-border rounded-lg p-3">
              <span className="data-label">Total Reads</span>
              <p className="text-lg font-semibold text-iot-text-primary font-mono mt-1">
                {totalReadCount}
              </p>
            </div>
          </div>

          {/* Register Snapshot Export */}
          <Card className="p-4">
            <div className="flex items-center gap-2 mb-3">
              <Database size={14} className="text-iot-cyan" />
              <h3 className="text-sm font-semibold text-iot-text-primary">Register Snapshot</h3>
              {hasRegisterData && <Badge variant="success">{values.length} values</Badge>}
            </div>
            <p className="text-xs text-iot-text-muted mb-4">
              Export the current register browser values as a snapshot file.
            </p>
            <div className="flex items-end gap-3">
              <div className="w-32">
                <Select
                  label="Format"
                  options={FORMAT_OPTIONS}
                  value={format}
                  onChange={(e) => setFormat(e.target.value as "json" | "csv")}
                />
              </div>
              <Button
                variant="primary"
                size="sm"
                onClick={handleExportRegisters}
                disabled={!hasRegisterData}
              >
                <FileText size={12} />
                Download {format.toUpperCase()}
              </Button>
              <Button
                variant="secondary"
                size="sm"
                onClick={handleCopy}
                disabled={!hasRegisterData}
              >
                {copied ? <Check size={12} className="text-iot-cyan" /> : <Copy size={12} />}
                {copied ? "Copied!" : "Copy"}
              </Button>
            </div>
          </Card>

          {/* Monitor Export */}
          <Card className="p-4">
            <div className="flex items-center gap-2 mb-3">
              <Activity size={14} className="text-iot-cyan" />
              <h3 className="text-sm font-semibold text-iot-text-primary">Monitor Snapshot</h3>
              {hasMonitorData && <Badge variant="success">{monitors.length} monitors</Badge>}
            </div>
            <p className="text-xs text-iot-text-muted mb-4">
              Export all monitor configurations and their latest polled values as JSON.
            </p>
            <Button
              variant="primary"
              size="sm"
              onClick={handleExportMonitors}
              disabled={!hasMonitorData}
            >
              <FileText size={12} />
              Export Monitors
            </Button>
          </Card>

          {/* Preview */}
          {hasRegisterData && (
            <div className="bg-iot-bg-surface border border-iot-border rounded-lg overflow-hidden">
              <div className="px-3 py-2 border-b border-iot-border flex items-center justify-between">
                <span className="text-xs font-semibold text-iot-text-secondary uppercase tracking-wider">Preview</span>
                <Badge>{format.toUpperCase()}</Badge>
              </div>
              <pre className="p-3 text-2xs font-mono text-iot-text-muted overflow-auto max-h-48 whitespace-pre">
                {exportContent.slice(0, 2000)}
                {exportContent.length > 2000 && "\n... (truncated)"}
              </pre>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
