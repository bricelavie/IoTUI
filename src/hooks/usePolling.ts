import { useEffect, useRef, useCallback } from "react";

/**
 * Runs `callback` on a repeating interval while `enabled` is true.
 * Fires immediately on enable, then every `intervalMs` milliseconds.
 * Includes an in-flight guard so overlapping async invocations are skipped.
 *
 * @param callback   - Async function to call on each tick.
 * @param intervalMs - Polling interval in milliseconds.
 * @param enabled    - Whether polling is active.
 */
export function usePolling(
  callback: () => Promise<void>,
  intervalMs: number,
  enabled: boolean
): void {
  const inFlightRef = useRef(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Keep a stable reference to the latest callback so the interval closure
  // never captures a stale version.
  const callbackRef = useRef(callback);
  useEffect(() => {
    callbackRef.current = callback;
  }, [callback]);

  const tick = useCallback(async () => {
    if (inFlightRef.current) return;
    inFlightRef.current = true;
    try {
      await callbackRef.current();
    } finally {
      inFlightRef.current = false;
    }
  }, []);

  useEffect(() => {
    if (!enabled) return;

    void tick(); // immediate first call
    intervalRef.current = setInterval(() => void tick(), intervalMs);

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [enabled, intervalMs, tick]);
}
