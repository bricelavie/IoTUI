import React, { useState, useMemo, useCallback } from "react";
import { useMqttSubscriptionStore } from "@/stores/mqttSubscriptionStore";
import { Badge, EmptyState, Tooltip } from "@/components/ui";
import {
  MessageSquare,
  Search,
  ArrowDownToLine,
  Copy,
  Check,
  Download,
  X,
  Filter as FilterIcon,
  Eye,
  Code,
  Hash,
} from "lucide-react";
import {
  formatTimestamp,
  formatPayload,
  payloadToHex,
  tokenizeJson,
  copyToClipboard,
  exportMessagesAsJson,
  exportMessagesAsCsv,
  downloadFile,
} from "@/utils/mqtt";
import { toast } from "@/stores/notificationStore";
import type { MqttMessage, MqttQoS } from "@/types/mqtt";

// ─── Types ───────────────────────────────────────────────────────

type PayloadView = "pretty" | "raw" | "hex";

interface MessageFilters {
  text: string;
  qos: MqttQoS | "all";
  retainOnly: "all" | "retained" | "non-retained";
  payloadRegex: string;
}

const DEFAULT_FILTERS: MessageFilters = {
  text: "",
  qos: "all",
  retainOnly: "all",
  payloadRegex: "",
};

// ─── JSON Syntax Highlighted Renderer ────────────────────────────

const JsonHighlighted: React.FC<{ json: string }> = React.memo(({ json }) => {
  const tokens = useMemo(() => tokenizeJson(json), [json]);

  const colorMap: Record<string, string> = {
    key: "text-iot-cyan",
    string: "text-iot-green",
    number: "text-iot-amber",
    boolean: "text-purple-400",
    null: "text-iot-text-disabled",
    punctuation: "text-iot-text-muted",
  };

  // Reconstruct with whitespace from original
  let pos = 0;
  const parts: React.ReactNode[] = [];

  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];
    const idx = json.indexOf(token.value, pos);
    if (idx > pos) {
      // Whitespace between tokens
      parts.push(<span key={`ws-${i}`}>{json.slice(pos, idx)}</span>);
    }
    parts.push(
      <span key={i} className={colorMap[token.type] || ""}>
        {token.value}
      </span>
    );
    pos = idx + token.value.length;
  }
  if (pos < json.length) {
    parts.push(<span key="trail">{json.slice(pos)}</span>);
  }

  return <>{parts}</>;
});
JsonHighlighted.displayName = "JsonHighlighted";

// ─── Message Row ─────────────────────────────────────────────────

const MessageRow: React.FC<{ msg: MqttMessage; showTopic: boolean }> = React.memo(({ msg, showTopic }) => {
  const [expanded, setExpanded] = useState(false);
  const [payloadView, setPayloadView] = useState<PayloadView>("pretty");
  const [justCopied, setJustCopied] = useState<string | null>(null);

  const handleCopy = useCallback(async (text: string, label: string) => {
    const ok = await copyToClipboard(text);
    if (ok) {
      setJustCopied(label);
      setTimeout(() => setJustCopied(null), 1500);
    }
  }, []);

  const renderedPayload = useMemo(() => {
    if (payloadView === "hex") return payloadToHex(msg.payload);
    if (payloadView === "raw") return msg.payload;
    return formatPayload(msg);
  }, [msg, payloadView]);

  const isJson = msg.payload_format === "json";

  return (
    <div className="border-b border-iot-border/30 hover:bg-iot-bg-hover/50 transition-colors">
      <button
        className={`grid gap-2 px-3 py-1.5 w-full text-left text-xs ${
          showTopic
            ? "grid-cols-[100px_1fr_60px_40px_40px_55px]"
            : "grid-cols-[100px_1fr_60px_40px_55px]"
        }`}
        onClick={() => setExpanded(!expanded)}
      >
        <span className="text-iot-text-disabled font-mono text-2xs">
          {formatTimestamp(msg.timestamp)}
        </span>
        {showTopic && (
          <span className="text-iot-text-primary font-mono truncate">{msg.topic}</span>
        )}
        {!showTopic && (
          <span className="text-iot-text-muted font-mono truncate text-2xs">{msg.payload.slice(0, 80)}</span>
        )}
        <Badge variant="default">{msg.payload_format}</Badge>
        <span className="text-iot-text-muted font-mono">QoS {msg.qos}</span>
        {showTopic && (
          <span>
            {msg.retain ? (
              <Badge variant="warning">R</Badge>
            ) : (
              <span className="text-iot-text-disabled">-</span>
            )}
          </span>
        )}
        <span className="text-iot-text-disabled text-2xs text-right">{msg.payload_size_bytes}B</span>
      </button>
      {expanded && (
        <div className="px-3 pb-2">
          {/* Payload toolbar */}
          <div className="flex items-center gap-1 mb-1">
            <div className="flex rounded border border-iot-border overflow-hidden">
              {(["pretty", "raw", "hex"] as PayloadView[]).map((v) => (
                <button
                  key={v}
                  onClick={() => setPayloadView(v)}
                  className={`px-2 py-0.5 text-2xs font-medium transition-colors ${
                    payloadView === v
                      ? "bg-iot-cyan/10 text-iot-cyan"
                      : "text-iot-text-disabled hover:text-iot-text-muted"
                  }`}
                >
                  {v === "pretty" ? <Eye size={10} className="inline mr-0.5" /> : v === "raw" ? <Code size={10} className="inline mr-0.5" /> : <Hash size={10} className="inline mr-0.5" />}
                  {v.charAt(0).toUpperCase() + v.slice(1)}
                </button>
              ))}
            </div>
            <div className="flex-1" />
            <button
              onClick={() => handleCopy(msg.payload, "payload")}
              className="flex items-center gap-1 px-2 py-0.5 text-2xs text-iot-text-disabled hover:text-iot-cyan transition-colors"
              title="Copy payload"
            >
              {justCopied === "payload" ? <Check size={10} className="text-iot-green" /> : <Copy size={10} />}
              Payload
            </button>
            <button
              onClick={() => handleCopy(msg.topic, "topic")}
              className="flex items-center gap-1 px-2 py-0.5 text-2xs text-iot-text-disabled hover:text-iot-cyan transition-colors"
              title="Copy topic"
            >
              {justCopied === "topic" ? <Check size={10} className="text-iot-green" /> : <Copy size={10} />}
              Topic
            </button>
            <button
              onClick={() => handleCopy(JSON.stringify({ topic: msg.topic, payload: msg.payload, qos: msg.qos, retain: msg.retain, timestamp: msg.timestamp }, null, 2), "json")}
              className="flex items-center gap-1 px-2 py-0.5 text-2xs text-iot-text-disabled hover:text-iot-cyan transition-colors"
              title="Copy as JSON"
            >
              {justCopied === "json" ? <Check size={10} className="text-iot-green" /> : <Copy size={10} />}
              JSON
            </button>
          </div>
          <pre className="text-xs font-mono whitespace-pre-wrap break-all max-h-48 overflow-auto bg-iot-bg-base rounded p-2 border border-iot-border/50">
            {isJson && payloadView === "pretty" ? (
              <JsonHighlighted json={renderedPayload} />
            ) : (
              <span className="text-iot-text-primary">{renderedPayload}</span>
            )}
          </pre>
          {/* Message metadata */}
          <div className="flex items-center gap-3 mt-1.5 text-2xs text-iot-text-disabled">
            <span>QoS {msg.qos}</span>
            {msg.retain && <span className="text-iot-amber">Retained</span>}
            <span>{msg.payload_size_bytes} bytes</span>
            <span className="font-mono">{msg.timestamp}</span>
          </div>
        </div>
      )}
    </div>
  );
});
MessageRow.displayName = "MessageRow";

// ─── Message Panel ───────────────────────────────────────────────

export const MqttMessagePanel: React.FC<{
  selectedTopic: string | null;
}> = ({ selectedTopic }) => {
  const { messages } = useMqttSubscriptionStore();
  const [filters, setFilters] = useState<MessageFilters>(DEFAULT_FILTERS);
  const [autoScroll, setAutoScroll] = useState(true);
  const [showFilters, setShowFilters] = useState(false);
  const [showExportMenu, setShowExportMenu] = useState(false);

  const scrollRef = React.useRef<HTMLDivElement>(null);

  const filtered = useMemo(() => {
    let result = messages;

    // Filter by selected topic
    if (selectedTopic) {
      result = result.filter((m) => m.topic === selectedTopic);
    }

    // Text search
    if (filters.text) {
      const lower = filters.text.toLowerCase();
      result = result.filter(
        (m) =>
          m.topic.toLowerCase().includes(lower) ||
          m.payload.toLowerCase().includes(lower)
      );
    }

    // QoS filter
    if (filters.qos !== "all") {
      result = result.filter((m) => m.qos === filters.qos);
    }

    // Retain filter
    if (filters.retainOnly === "retained") {
      result = result.filter((m) => m.retain);
    } else if (filters.retainOnly === "non-retained") {
      result = result.filter((m) => !m.retain);
    }

    // Payload regex
    if (filters.payloadRegex) {
      try {
        const re = new RegExp(filters.payloadRegex, "i");
        result = result.filter((m) => re.test(m.payload));
      } catch {
        // invalid regex, ignore
      }
    }

    return result;
  }, [messages, selectedTopic, filters]);

  const displayed = useMemo(() => [...filtered].reverse(), [filtered]);

  const activeFilterCount = useMemo(() => {
    let count = 0;
    if (filters.text) count++;
    if (filters.qos !== "all") count++;
    if (filters.retainOnly !== "all") count++;
    if (filters.payloadRegex) count++;
    return count;
  }, [filters]);

  React.useEffect(() => {
    if (autoScroll && scrollRef.current) {
      scrollRef.current.scrollTop = 0;
    }
  }, [messages.length, autoScroll]);

  const handleExport = useCallback((format: "json" | "csv") => {
    const data = format === "json"
      ? exportMessagesAsJson(filtered)
      : exportMessagesAsCsv(filtered);
    const ext = format;
    const mime = format === "json" ? "application/json" : "text/csv";
    const timestamp = new Date().toISOString().slice(0, 19).replace(/[T:]/g, "-");
    downloadFile(data, `mqtt-messages-${timestamp}.${ext}`, mime);
    toast.success("Exported", `${filtered.length} messages as ${format.toUpperCase()}`);
  }, [filtered]);

  const showTopic = !selectedTopic;

  if (messages.length === 0) {
    return (
      <div className="h-full flex items-center justify-center">
        <EmptyState
          icon={<MessageSquare size={32} />}
          title="No Messages"
          description="Messages will appear here as they arrive from subscribed topics"
        />
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col">
      {/* Toolbar */}
      <div className="flex items-center gap-2 px-3 py-2 border-b border-iot-border flex-shrink-0">
        <MessageSquare size={14} className="text-iot-cyan" />
        <span className="text-xs font-semibold text-iot-text-secondary uppercase tracking-wider">
          {selectedTopic ? "Topic Messages" : "All Messages"}
        </span>
        <Badge variant="info">{filtered.length}</Badge>
        {selectedTopic && (
          <span className="text-2xs font-mono text-iot-cyan truncate max-w-[200px]">{selectedTopic}</span>
        )}
        <div className="flex-1" />

        {/* Quick search */}
        <div className="w-40">
          <div className="relative">
            <Search size={10} className="absolute left-2 top-1/2 -translate-y-1/2 text-iot-text-disabled" />
            <input
              value={filters.text}
              onChange={(e) => setFilters({ ...filters, text: e.target.value })}
              placeholder="Search..."
              className="w-full pl-6 pr-2 py-1 text-2xs bg-iot-bg-base border border-iot-border rounded text-iot-text-primary placeholder:text-iot-text-disabled focus:outline-none focus:border-iot-cyan/50"
            />
          </div>
        </div>

        {/* Advanced filters toggle */}
        <Tooltip content="Advanced filters">
          <button
            onClick={() => setShowFilters(!showFilters)}
            className={`p-1 rounded transition-colors relative focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-iot-border-focus focus-visible:ring-offset-1 focus-visible:ring-offset-iot-bg-surface ${
              showFilters || activeFilterCount > 0
                ? "text-iot-cyan bg-iot-cyan/10"
                : "text-iot-text-disabled hover:text-iot-text-muted"
            }`}
          >
            <FilterIcon size={14} />
            {activeFilterCount > 0 && (
              <span className="absolute -top-1 -right-1 w-3.5 h-3.5 rounded-full bg-iot-cyan text-[8px] font-bold text-iot-bg-surface flex items-center justify-center">
                {activeFilterCount}
              </span>
            )}
          </button>
        </Tooltip>

        {/* Export */}
        <div className="relative">
          <Tooltip content="Export messages">
            <button
              onClick={() => setShowExportMenu(!showExportMenu)}
              onBlur={() => setTimeout(() => setShowExportMenu(false), 150)}
              className="p-1 rounded text-iot-text-disabled hover:text-iot-text-muted transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-iot-border-focus focus-visible:ring-offset-1 focus-visible:ring-offset-iot-bg-surface"
            >
              <Download size={14} />
            </button>
          </Tooltip>
          {showExportMenu && (
            <div className="absolute right-0 top-full mt-1 bg-iot-bg-elevated border border-iot-border rounded shadow-lg z-10">
              <button
                onClick={() => { handleExport("json"); setShowExportMenu(false); }}
                className="block w-full text-left px-3 py-1.5 text-xs text-iot-text-secondary hover:bg-iot-bg-hover whitespace-nowrap focus-visible:outline-none focus-visible:bg-iot-bg-hover"
              >
                Export JSON
              </button>
              <button
                onClick={() => { handleExport("csv"); setShowExportMenu(false); }}
                className="block w-full text-left px-3 py-1.5 text-xs text-iot-text-secondary hover:bg-iot-bg-hover whitespace-nowrap focus-visible:outline-none focus-visible:bg-iot-bg-hover"
              >
                Export CSV
              </button>
            </div>
          )}
        </div>

        {/* Auto-scroll */}
        <Tooltip content={autoScroll ? "Auto-scroll ON" : "Auto-scroll OFF"}>
          <button
            onClick={() => setAutoScroll(!autoScroll)}
            className={`p-1 rounded transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-iot-border-focus focus-visible:ring-offset-1 focus-visible:ring-offset-iot-bg-surface ${
              autoScroll ? "text-iot-cyan bg-iot-cyan/10" : "text-iot-text-disabled hover:text-iot-text-muted"
            }`}
          >
            <ArrowDownToLine size={14} />
          </button>
        </Tooltip>
      </div>

      {/* Advanced filter bar */}
      {showFilters && (
        <div className="flex items-center gap-3 px-3 py-2 border-b border-iot-border bg-iot-bg-base/50 flex-shrink-0">
          <div className="flex items-center gap-1.5">
            <span className="text-2xs text-iot-text-disabled uppercase">QoS:</span>
            <select
              value={filters.qos}
              onChange={(e) => setFilters({ ...filters, qos: e.target.value as MqttQoS | "all" })}
              className="text-2xs bg-iot-bg-base border border-iot-border rounded px-1.5 py-0.5 text-iot-text-primary focus:outline-none focus:border-iot-cyan/50"
            >
              <option value="all">All</option>
              <option value="0">0</option>
              <option value="1">1</option>
              <option value="2">2</option>
            </select>
          </div>

          <div className="flex items-center gap-1.5">
            <span className="text-2xs text-iot-text-disabled uppercase">Retain:</span>
            <select
              value={filters.retainOnly}
              onChange={(e) => setFilters({ ...filters, retainOnly: e.target.value as MessageFilters["retainOnly"] })}
              className="text-2xs bg-iot-bg-base border border-iot-border rounded px-1.5 py-0.5 text-iot-text-primary focus:outline-none focus:border-iot-cyan/50"
            >
              <option value="all">All</option>
              <option value="retained">Retained</option>
              <option value="non-retained">Non-retained</option>
            </select>
          </div>

          <div className="flex items-center gap-1.5 flex-1 max-w-xs">
            <span className="text-2xs text-iot-text-disabled uppercase whitespace-nowrap">Payload regex:</span>
            <input
              value={filters.payloadRegex}
              onChange={(e) => setFilters({ ...filters, payloadRegex: e.target.value })}
              placeholder="e.g. temperature|humidity"
              className="flex-1 text-2xs bg-iot-bg-base border border-iot-border rounded px-1.5 py-0.5 font-mono text-iot-text-primary placeholder:text-iot-text-disabled focus:outline-none focus:border-iot-cyan/50"
            />
          </div>

          {activeFilterCount > 0 && (
            <button
              onClick={() => setFilters(DEFAULT_FILTERS)}
              className="flex items-center gap-1 text-2xs text-iot-text-disabled hover:text-iot-red transition-colors"
            >
              <X size={10} />
              Clear all
            </button>
          )}
        </div>
      )}

      {/* Table header */}
      <div
        className={`grid gap-2 px-3 py-1.5 border-b border-iot-border text-2xs font-medium text-iot-text-disabled uppercase tracking-wider flex-shrink-0 ${
          showTopic
            ? "grid-cols-[100px_1fr_60px_40px_40px_55px]"
            : "grid-cols-[100px_1fr_60px_40px_55px]"
        }`}
      >
        <span>Time</span>
        <span>{showTopic ? "Topic" : "Preview"}</span>
        <span>Format</span>
        <span>QoS</span>
        {showTopic && <span>Ret</span>}
        <span className="text-right">Size</span>
      </div>

      {/* Message rows */}
      <div className="flex-1 overflow-auto" ref={scrollRef}>
        {displayed.map((msg) => (
          <MessageRow key={msg.id} msg={msg} showTopic={showTopic} />
        ))}
        {displayed.length === 0 && (
          <div className="flex items-center justify-center py-8">
            <div className="flex items-center gap-2 text-xs text-iot-text-muted">
              <Search size={14} />
              {activeFilterCount > 0 || filters.text
                ? "No messages matching filters"
                : selectedTopic
                ? `No messages for "${selectedTopic}"`
                : "No messages yet"}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
