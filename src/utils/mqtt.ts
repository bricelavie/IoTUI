import type { MqttMessage } from "@/types/mqtt";

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

// ─── Payload Formatting ──────────────────────────────────────────

export function formatPayload(msg: MqttMessage): string {
  if (msg.payload_format === "json") {
    try {
      return JSON.stringify(JSON.parse(msg.payload), null, 2);
    } catch {
      return msg.payload;
    }
  }
  return msg.payload;
}

export function payloadToHex(payload: string): string {
  return Array.from(new TextEncoder().encode(payload))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join(" ");
}

// ─── Byte Formatting ─────────────────────────────────────────────

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

// ─── Uptime Formatting ───────────────────────────────────────────

export function formatUptime(secs: number): string {
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  const s = Math.floor(secs % 60);
  if (h > 0) return `${h}h ${m}m ${s}s`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
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

// ─── Message Export ──────────────────────────────────────────────

export function exportMessagesAsJson(messages: MqttMessage[]): string {
  return JSON.stringify(
    messages.map((m) => ({
      topic: m.topic,
      payload: m.payload,
      payload_format: m.payload_format,
      qos: m.qos,
      retain: m.retain,
      timestamp: m.timestamp,
      payload_size_bytes: m.payload_size_bytes,
    })),
    null,
    2
  );
}

export function exportMessagesAsCsv(messages: MqttMessage[]): string {
  const header = "timestamp,topic,qos,retain,payload_format,payload_size_bytes,payload";
  const rows = messages.map((m) => {
    const escaped = m.payload.replace(/"/g, '""');
    return `${m.timestamp},${m.topic},${m.qos},${m.retain},${m.payload_format},${m.payload_size_bytes},"${escaped}"`;
  });
  return [header, ...rows].join("\n");
}

export function downloadFile(content: string, filename: string, mimeType: string) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

// ─── JSON Syntax Highlighting ────────────────────────────────────

export interface JsonToken {
  type: "key" | "string" | "number" | "boolean" | "null" | "punctuation";
  value: string;
}

export function tokenizeJson(json: string): JsonToken[] {
  const tokens: JsonToken[] = [];
  // Match JSON tokens: strings, numbers, booleans, null, and punctuation
  const regex = /("(?:[^"\\]|\\.)*")\s*:|("(?:[^"\\]|\\.)*")|(-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)|(\btrue\b|\bfalse\b)|(\bnull\b)|([{}[\]:,])/g;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(json)) !== null) {
    if (match[1] !== undefined) {
      tokens.push({ type: "key", value: match[1] });
      tokens.push({ type: "punctuation", value: ":" });
    } else if (match[2] !== undefined) {
      tokens.push({ type: "string", value: match[2] });
    } else if (match[3] !== undefined) {
      tokens.push({ type: "number", value: match[3] });
    } else if (match[4] !== undefined) {
      tokens.push({ type: "boolean", value: match[4] });
    } else if (match[5] !== undefined) {
      tokens.push({ type: "null", value: match[5] });
    } else if (match[6] !== undefined) {
      tokens.push({ type: "punctuation", value: match[6] });
    }
  }

  return tokens;
}

// ─── Message Rate Calculation ────────────────────────────────────

/** Calculate messages per second from an array of timestamps (ISO strings). */
export function calculateMessageRate(timestamps: string[], windowSecs = 10): number {
  if (timestamps.length < 2) return 0;
  const now = Date.now();
  const windowMs = windowSecs * 1000;
  const recent = timestamps.filter(
    (ts) => now - new Date(ts).getTime() < windowMs
  );
  if (recent.length < 2) return 0;
  return recent.length / windowSecs;
}
