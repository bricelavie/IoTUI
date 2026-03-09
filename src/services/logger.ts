import { invoke } from "@tauri-apps/api/core";
import { useLogStore } from "@/stores/logStore";
import { getSetting } from "@/stores/settingsStore";
import type {
  LogLevel,
  LogCategory,
  LogEntry,
  BackendLogEntry,
} from "@/types/opcua";
import { errorMessage } from "@/types/opcua";

// ─── Sensitive data masking ──────────────────────────────────────

const SENSITIVE_KEYS = /password|token|secret|credential|auth_key/i;

function maskSensitiveData(value: unknown): unknown {
  if (typeof value === "string") return value;
  if (value === null || value === undefined) return value;
  if (Array.isArray(value)) return value.map(maskSensitiveData);
  if (typeof value === "object") {
    const masked: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (SENSITIVE_KEYS.test(k) && typeof v === "string") {
        masked[k] = "****";
      } else {
        masked[k] = maskSensitiveData(v);
      }
    }
    return masked;
  }
  return value;
}

// ─── Core log function ───────────────────────────────────────────

export function log(
  level: LogLevel,
  category: LogCategory,
  source: string,
  message: string,
  details?: string,
  duration?: number
) {
  const entry: Omit<LogEntry, "id"> = {
    timestamp: new Date().toISOString(),
    level,
    category,
    source,
    message,
    details,
    duration,
  };
  useLogStore.getState().addEntry(entry);
}

// ─── IPC logging wrapper ─────────────────────────────────────────

/** Commands that fire at high frequency (every poll cycle). */
const POLL_COMMANDS = new Set([
  "opcua_poll_subscription",
  "opcua_poll_events",
  "opcua_get_backend_logs",
  "mqtt_poll_messages",
  "mqtt_get_topics",
  "mqtt_get_broker_stats",
  "mqtt_get_broker_clients",
  "mqtt_get_connection_status",
]);

export function withLogging<TArgs extends unknown[], TResult>(
  commandName: string,
  fn: (...args: TArgs) => Promise<TResult>
): (...args: TArgs) => Promise<TResult> {
  return async (...args: TArgs) => {
    // Skip logging for high-frequency poll commands unless explicitly enabled
    const shouldLog =
      !POLL_COMMANDS.has(commandName) || getSetting("logIpcPolling");

    if (shouldLog) {
      const maskedArgs = maskSensitiveData(args);
      const argsStr =
        args.length > 0 ? JSON.stringify(maskedArgs) : "";
      log("debug", "ipc", commandName, `Calling ${commandName}`, argsStr);
    }

    const start = performance.now();
    try {
      const result = await fn(...args);
      const duration = Math.round(performance.now() - start);

      if (shouldLog) {
        // Summarize result for details (truncate large payloads)
        let resultSummary: string | undefined;
        if (result !== undefined && result !== null) {
          const maxLen = getSetting("ipcResultTruncation");
          const str = JSON.stringify(result);
          resultSummary = str.length > maxLen ? str.slice(0, maxLen) + "..." : str;
        }

        log(
          "debug",
          "ipc",
          commandName,
          `${commandName} OK (${duration}ms)`,
          resultSummary,
          duration
        );
      }

      return result;
    } catch (err) {
      // Always log errors, even for poll commands
      const duration = Math.round(performance.now() - start);
      const errMsg = errorMessage(err);
      log(
        "error",
        "ipc",
        commandName,
        `${commandName} FAILED (${duration}ms): ${errMsg}`,
        undefined,
        duration
      );
      throw err;
    }
  };
}

// ─── Backend log polling ─────────────────────────────────────────

let backendPollInterval: ReturnType<typeof setInterval> | null = null;
let backendPollInFlight = false;
let backendLogCursor = 0;

function mapBackendLevel(level: string): LogLevel {
  switch (level.toLowerCase()) {
    case "trace":
      return "trace";
    case "debug":
      return "debug";
    case "info":
      return "info";
    case "warn":
    case "warning":
      return "warn";
    case "error":
      return "error";
    default:
      return "info";
  }
}

async function pollBackendLogs() {
  if (backendPollInFlight) return;
  backendPollInFlight = true;
  try {
    const response = await invoke<{ entries: BackendLogEntry[]; cursor: number }>(
      "get_backend_logs",
      { cursor: backendLogCursor }
    );
    const { entries: logs, cursor: newCursor } = response;
    backendLogCursor = newCursor;

    if (logs.length === 0) return;

    const entries: Omit<LogEntry, "id">[] = logs.map((entry) => ({
      timestamp: entry.timestamp,
      level: mapBackendLevel(entry.level),
      category: "backend" as LogCategory,
      source: entry.target,
      message: entry.message,
    }));

    useLogStore.getState().addEntries(entries);
  } catch (err) {
    // Log the failure at warn level so it is visible in the log panel.
    // Use a direct addEntry call to avoid recursing into pollBackendLogs.
    const errMsg = errorMessage(err);
    useLogStore.getState().addEntry({
      timestamp: new Date().toISOString(),
      level: "warn",
      category: "backend",
      source: "get_backend_logs",
      message: `Backend log poll failed: ${errMsg}`,
    });
  } finally {
    backendPollInFlight = false;
  }
}

export function startBackendLogPolling(intervalMs?: number) {
  if (backendPollInterval) return;
  const interval = intervalMs ?? getSetting("backendLogPollInterval");
  pollBackendLogs(); // Initial poll
  backendPollInterval = setInterval(pollBackendLogs, interval);
}

export function stopBackendLogPolling() {
  if (backendPollInterval) {
    clearInterval(backendPollInterval);
    backendPollInterval = null;
  }
}

// ─── Backend log level control ───────────────────────────────────

export async function setBackendLogLevel(level: string): Promise<string> {
  return invoke<string>("set_log_level", { level });
}
