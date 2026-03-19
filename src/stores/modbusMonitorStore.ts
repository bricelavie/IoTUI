import { create } from "zustand";
import type {
  MonitorRequest,
  MonitoredRegister,
  ModbusPollResponse,
} from "@/types/modbus";
import { errorMessage } from "@/utils/errors";
import * as modbus from "@/services/modbus";
import { toast } from "@/stores/notificationStore";
import { getSetting } from "@/stores/settingsStore";
import { log } from "@/services/logger";

interface PollController {
  timerId: ReturnType<typeof setTimeout> | null;
  inFlight: boolean;
  lastError: string | null;
  lastSuccessAt: number | null;
  connectionId: string;
}

interface ModbusMonitorStore {
  monitors: MonitoredRegister[];
  isPolling: boolean;
  pollError: string | null;
  lastPollAt: number | null;
  lastPollDurationMs: number | null;

  addMonitor: (connectionId: string, request: MonitorRequest) => Promise<number>;
  removeMonitor: (connectionId: string, monitorId: number) => Promise<void>;
  refreshMonitors: (connectionId: string) => Promise<void>;
  startPolling: (connectionId: string) => void;
  stopPolling: () => void;
  clearAll: () => void;
}

let pollController: PollController | null = null;

function clearPollController() {
  if (pollController?.timerId) {
    clearTimeout(pollController.timerId);
  }
  pollController = null;
}

export const useModbusMonitorStore = create<ModbusMonitorStore>((set, get) => ({
  monitors: [],
  isPolling: false,
  pollError: null,
  lastPollAt: null,
  lastPollDurationMs: null,

  addMonitor: async (connectionId, request) => {
    try {
      const result = await modbus.modbusAddMonitor(connectionId, request);
      const monitors = await modbus.modbusGetMonitors(connectionId);
      set({ monitors });
      log("info", "subscription", "modbus_add_monitor", `Added monitor "${result.label}" (id=${result.id})`);
      toast.success("Monitor Added", result.label);
      return result.id;
    } catch (err) {
      toast.error("Add Monitor Failed", errorMessage(err));
      throw err;
    }
  },

  removeMonitor: async (connectionId, monitorId) => {
    try {
      const monitor = get().monitors.find((m) => m.id === monitorId);
      await modbus.modbusRemoveMonitor(connectionId, monitorId);
      const monitors = await modbus.modbusGetMonitors(connectionId);
      set({ monitors });
      log("info", "subscription", "modbus_remove_monitor", `Removed monitor (id=${monitorId})`);
      toast.info("Monitor Removed", monitor?.label || `#${monitorId}`);
    } catch (err) {
      toast.error("Remove Monitor Failed", errorMessage(err));
      throw err;
    }
  },

  refreshMonitors: async (connectionId) => {
    try {
      const monitors = await modbus.modbusGetMonitors(connectionId);
      set({ monitors });
    } catch (err) {
      toast.error("Refresh Monitors Failed", errorMessage(err));
    }
  },

  startPolling: (connectionId) => {
    // Stop any existing poll
    clearPollController();

    const controller: PollController = {
      timerId: null,
      inFlight: false,
      lastError: null,
      lastSuccessAt: null,
      connectionId,
    };
    pollController = controller;

    const baseInterval = getSetting("modbusPollInterval");
    const MAX_BACKOFF = 10000;
    let consecutiveErrors = 0;

    const schedule = (delay: number) => {
      controller.timerId = setTimeout(runPoll, delay);
    };

    const runPoll = async () => {
      if (controller.inFlight) {
        schedule(getSetting("modbusPollInterval"));
        return;
      }

      controller.inFlight = true;
      try {
        const response: ModbusPollResponse = await modbus.modbusPollMonitors(controller.connectionId);
        controller.lastError = null;
        controller.lastSuccessAt = Date.now();
        consecutiveErrors = 0;

        set({
          monitors: response.monitors,
          pollError: null,
          lastPollAt: Date.now(),
          lastPollDurationMs: response.poll_duration_ms,
        });
      } catch (e) {
        const message = errorMessage(e);
        controller.lastError = message;
        consecutiveErrors += 1;
        set({ pollError: message });
        log("warn", "subscription", "modbus_poll", `Poll failed: ${message}`);
      } finally {
        controller.inFlight = false;
        if (get().isPolling) {
          const currentInterval = getSetting("modbusPollInterval");
          const delay = consecutiveErrors > 0
            ? Math.min(currentInterval * Math.pow(2, consecutiveErrors - 1), MAX_BACKOFF)
            : currentInterval;
          schedule(delay);
        }
      }
    };

    set({ isPolling: true });
    log("info", "subscription", "modbus_startPolling", `Polling Modbus every ${baseInterval}ms`);
    void runPoll();
  },

  stopPolling: () => {
    clearPollController();
    set({ isPolling: false });
    log("info", "subscription", "modbus_stopPolling", "Modbus polling stopped");
  },

  clearAll: () => {
    get().stopPolling();
    set({
      monitors: [],
      isPolling: false,
      pollError: null,
      lastPollAt: null,
      lastPollDurationMs: null,
    });
  },
}));
