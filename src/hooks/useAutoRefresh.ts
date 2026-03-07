import { useState } from "react";
import { usePolling } from "./usePolling";

interface UseAutoRefreshOptions {
  /** The async action to call on each refresh tick. */
  action: () => Promise<void>;
  /** Refresh interval in milliseconds. */
  intervalMs: number;
  /** Whether auto-refresh is allowed to start (e.g. requires a connection). */
  canEnable?: boolean;
}

interface UseAutoRefreshResult {
  /** Whether auto-refresh is currently active. */
  autoRefresh: boolean;
  /** Toggle auto-refresh on or off. */
  setAutoRefresh: (value: boolean) => void;
  /** Current refresh interval in milliseconds. */
  refreshInterval: number;
  /** Update the refresh interval (restart takes effect on next enable). */
  setRefreshInterval: (value: number) => void;
}

/**
 * Manages a user-controllable auto-refresh toggle backed by `usePolling`.
 * Automatically stops when `canEnable` becomes false.
 */
export function useAutoRefresh({
  action,
  intervalMs,
  canEnable = true,
}: UseAutoRefreshOptions): UseAutoRefreshResult {
  const [autoRefresh, setAutoRefresh] = useState(false);
  const [refreshInterval, setRefreshInterval] = useState(intervalMs);

  const enabled = autoRefresh && canEnable;
  usePolling(action, refreshInterval, enabled);

  return { autoRefresh, setAutoRefresh, refreshInterval, setRefreshInterval };
}
