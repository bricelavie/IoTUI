// ─── Shared Error Utilities ──────────────────────────────────────
//
// Protocol-agnostic error parsing and formatting used throughout the
// application. These were originally defined in `src/types/opcua.ts`
// and are re-exported from there for backward compatibility.

export type AppErrorKind =
  | "OpcUa"
  | "Mqtt"
  | "Connection"
  | "NotFound"
  | "InvalidArgument"
  | "Security";

export interface AppError {
  kind: AppErrorKind;
  message: string;
}

/**
 * Parse a Tauri invoke rejection into a structured `AppError`.
 *
 * With Tauri 2 native error serialization the backend returns `{ kind, message }`
 * objects directly.  Legacy string payloads (JSON-encoded or plain) are still
 * handled for backwards compatibility.
 */
export function parseAppError(raw: unknown): AppError {
  // Already a structured error object from Tauri 2 native serialization
  if (raw != null && typeof raw === "object") {
    const obj = raw as Record<string, unknown>;
    if (typeof obj.kind === "string" && typeof obj.message === "string") {
      return obj as unknown as AppError;
    }
  }
  // Legacy: JSON-encoded string from old `Result<T, String>` commands
  if (typeof raw === "string") {
    try {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed.kind === "string" && typeof parsed.message === "string") {
        return parsed as AppError;
      }
    } catch {
      // not JSON — use raw string as message
    }
    return { kind: "Connection", message: raw };
  }
  return { kind: "Connection", message: String(raw ?? "Unknown error") };
}

/**
 * Extract a human-readable error message from any caught value.
 *
 * Use this everywhere instead of `String(e)` so that structured
 * `AppError` objects are displayed properly.
 */
export function errorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (err != null && typeof err === "object") {
    const obj = err as Record<string, unknown>;
    if (typeof obj.message === "string") return obj.message;
  }
  if (typeof err === "string") return err;
  return String(err ?? "Unknown error");
}
