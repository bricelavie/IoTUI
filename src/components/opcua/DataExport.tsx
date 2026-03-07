import React, { useState, useMemo } from "react";
import { useSubscriptionStore } from "@/stores/subscriptionStore";
import { Button, Badge, Select, EmptyState } from "@/components/ui";
import { Download, FileSpreadsheet, Copy, Check } from "lucide-react";
import { toast } from "@/stores/notificationStore";

type ExportFormat = "csv" | "json" | "tsv";

const EXPORT_FORMATS: ExportFormat[] = ["csv", "json", "tsv"];

function isExportFormat(value: string): value is ExportFormat {
  return (EXPORT_FORMATS as string[]).includes(value);
}

/** Escape a value for CSV: wrap in quotes if it contains comma, quote, or newline */
function csvEscape(val: string | number | undefined | null): string {
  const s = val == null ? "" : String(val);
  if (s.includes(",") || s.includes('"') || s.includes("\n") || s.includes("\r")) {
    return '"' + s.replace(/"/g, '""') + '"';
  }
  return s;
}

export const DataExport: React.FC = () => {
  const { monitoredValues, subscriptions } = useSubscriptionStore();
  const [format, setFormat] = useState<ExportFormat>("csv");
  const [includeHistory, setIncludeHistory] = useState(true);
  const [copied, setCopied] = useState(false);

  const values = useMemo(() => Array.from(monitoredValues.entries()), [monitoredValues]);

  const generateExport = (fmt: ExportFormat, historyEnabled: boolean): string => {
    if (values.length === 0) return "";

    if (fmt === "json") {
      const data = values.map(([valueKey, val]) => ({
        key: valueKey,
        node_id: val.node_id,
        display_name: val.display_name,
        subscription_id: val.subscription_id,
        value: val.numericValue ?? val.value,
        data_type: val.data_type,
        status: val.status_code,
        source_timestamp: val.source_timestamp,
        server_timestamp: val.server_timestamp,
        ...(historyEnabled && {
          history: val.history.map((h) => ({
            timestamp: new Date(h.timestamp).toISOString(),
            value: h.value,
          })),
        }),
      }));
      return JSON.stringify(data, null, 2);
    }

    const separator = fmt === "tsv" ? "\t" : ",";
    const esc = fmt === "csv" ? csvEscape : (v: string | number | undefined | null) => String(v ?? "");
    const headers = ["Node ID", "Display Name", "Value", "Data Type", "Status", "Timestamp"];

    if (historyEnabled) {
      let rows: string[] = [headers.join(separator)];
      for (const [, val] of values) {
        if (val.history.length > 0) {
          for (const h of val.history) {
            rows.push(
              [
                esc(val.node_id),
                esc(val.display_name),
                esc(h.value.toString()),
                esc(val.data_type),
                esc(val.status_code),
                esc(new Date(h.timestamp).toISOString()),
              ].join(separator)
            );
          }
        } else {
          rows.push(
            [esc(val.node_id), esc(val.display_name), esc(val.value), esc(val.data_type), esc(val.status_code), esc(val.source_timestamp || "")].join(
              separator
            )
          );
        }
      }
      return rows.join("\n");
    }

    const rows = [
      headers.join(separator),
      ...values.map(([, val]) =>
        [esc(val.node_id), esc(val.display_name), esc(val.numericValue ?? val.value), esc(val.data_type), esc(val.status_code), esc(val.source_timestamp || "")].join(
          separator
        )
      ),
    ];
    return rows.join("\n");
  };

  const exportContent = useMemo(
    () => generateExport(format, includeHistory),
    [values, format, includeHistory]
  );

  const handleDownload = () => {
    if (!exportContent) return;

    const mimeTypes: Record<ExportFormat, string> = {
      csv: "text/csv",
      json: "application/json",
      tsv: "text/tab-separated-values",
    };

    const blob = new Blob([exportContent], { type: mimeTypes[format] });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `iotui-export-${new Date().toISOString().slice(0, 19).replace(/:/g, "-")}.${format}`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    toast.success(`Exported ${values.length} node(s) as ${format.toUpperCase()}`);
  };

  const handleCopy = async () => {
    if (!exportContent) return;
    try {
      await navigator.clipboard.writeText(exportContent);
      setCopied(true);
      toast.success("Copied to clipboard");
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("Copy failed", "Could not access clipboard");
    }
  };

  const totalHistoryPoints = values.reduce((sum, [, val]) => sum + val.history.length, 0);

  return (
    <div className="h-full overflow-auto p-4">
      <div className="max-w-3xl mx-auto space-y-4">
        <h3 className="text-sm font-semibold text-iot-text-primary flex items-center gap-2">
          <Download size={14} className="text-iot-cyan" />
          Data Export
        </h3>

        {values.length === 0 ? (
          <EmptyState
            icon={<FileSpreadsheet size={32} />}
            title="No Data to Export"
            description="Start monitoring values to collect exportable data"
          />
        ) : (
          <>
            {/* Stats */}
            <div className="grid grid-cols-3 gap-3">
              <div className="bg-iot-bg-surface border border-iot-border rounded-lg p-3">
                <span className="data-label">Monitored Nodes</span>
                <p className="text-lg font-semibold text-iot-text-primary font-mono mt-1">{values.length}</p>
              </div>
              <div className="bg-iot-bg-surface border border-iot-border rounded-lg p-3">
                <span className="data-label">History Points</span>
                <p className="text-lg font-semibold text-iot-text-primary font-mono mt-1">{totalHistoryPoints}</p>
              </div>
              <div className="bg-iot-bg-surface border border-iot-border rounded-lg p-3">
                <span className="data-label">Subscriptions</span>
                <p className="text-lg font-semibold text-iot-text-primary font-mono mt-1">{subscriptions.length}</p>
              </div>
            </div>

            {/* Options */}
            <div className="bg-iot-bg-surface border border-iot-border rounded-lg p-4 space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <Select
                  label="Format"
                  value={format}
                  onChange={(e) => { if (isExportFormat(e.target.value)) setFormat(e.target.value); }}
                  options={[
                    { value: "csv", label: "CSV (Comma Separated)" },
                    { value: "json", label: "JSON" },
                    { value: "tsv", label: "TSV (Tab Separated)" },
                  ]}
                />
                <div className="flex flex-col gap-1">
                  <label className="text-xs text-iot-text-muted font-medium">Options</label>
                  <label className="flex items-center gap-2 mt-1 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={includeHistory}
                      onChange={(e) => setIncludeHistory(e.target.checked)}
                      className="rounded border-iot-border bg-iot-bg-base"
                    />
                    <span className="text-xs text-iot-text-secondary">Include history data</span>
                  </label>
                </div>
              </div>

              <div className="flex gap-2">
                <Button variant="primary" size="md" onClick={handleDownload} className="flex-1">
                  <Download size={14} />
                  Download {format.toUpperCase()}
                </Button>
                <Button variant="secondary" size="md" onClick={handleCopy}>
                  {copied ? <Check size={14} className="text-iot-cyan" /> : <Copy size={14} />}
                  {copied ? "Copied!" : "Copy"}
                </Button>
              </div>
            </div>

            {/* Preview */}
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
          </>
        )}
      </div>
    </div>
  );
};
