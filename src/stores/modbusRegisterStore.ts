import { create } from "zustand";
import type {
  RegisterReadRequest,
  RegisterValue,
  RegisterWriteRequest,
  RegisterWriteResult,
  RegisterType,
  ModbusDataType,
} from "@/types/modbus";
import { errorMessage } from "@/utils/errors";
import * as modbus from "@/services/modbus";
import { toast } from "@/stores/notificationStore";
import { log } from "@/services/logger";

interface ModbusRegisterStore {
  /** Latest read results */
  values: RegisterValue[];
  /** Write results from the last write operation */
  writeResults: RegisterWriteResult[];
  isReading: boolean;
  isWriting: boolean;
  readError: string | null;
  writeError: string | null;

  // ─── Form state ────────────────────────────────────────────────
  registerType: RegisterType;
  startAddress: number;
  count: number;
  dataType: ModbusDataType;

  setRegisterType: (rt: RegisterType) => void;
  setStartAddress: (addr: number) => void;
  setCount: (count: number) => void;
  setDataType: (dt: ModbusDataType) => void;

  readRegisters: (connectionId: string) => Promise<void>;
  writeRegisters: (connectionId: string, request: RegisterWriteRequest) => Promise<void>;
  clearValues: () => void;
  clearErrors: () => void;
}

export const useModbusRegisterStore = create<ModbusRegisterStore>((set, get) => ({
  values: [],
  writeResults: [],
  isReading: false,
  isWriting: false,
  readError: null,
  writeError: null,

  registerType: "holding_register",
  startAddress: 0,
  count: 10,
  dataType: "u16",

  setRegisterType: (rt) => set({ registerType: rt }),
  setStartAddress: (addr) => set({ startAddress: addr }),
  setCount: (count) => set({ count }),
  setDataType: (dt) => set({ dataType: dt }),

  readRegisters: async (connectionId: string) => {
    const { registerType, startAddress, count } = get();
    const request: RegisterReadRequest = {
      register_type: registerType,
      start_address: startAddress,
      count,
    };
    set({ isReading: true, readError: null });
    try {
      const values = await modbus.modbusReadRegisters(connectionId, request);
      set({ values, isReading: false });
    } catch (e) {
      const msg = errorMessage(e);
      log("error", "action", "modbus_read", `Read failed: ${msg}`);
      set({ readError: msg, isReading: false });
    }
  },

  writeRegisters: async (connectionId: string, request: RegisterWriteRequest) => {
    set({ isWriting: true, writeError: null });
    try {
      const results = await modbus.modbusWriteRegisters(connectionId, request);
      set({ writeResults: results, isWriting: false });
      const allOk = results.every((r) => r.success);
      if (allOk) {
        toast.success("Write Successful", `Wrote to address ${request.start_address}`);
        log("info", "action", "modbus_write", `Wrote ${request.values.length} value(s) to addr ${request.start_address}`);
      } else {
        const failed = results.filter((r) => !r.success);
        toast.error("Write Partial Failure", `${failed.length} write(s) failed`);
      }
    } catch (e) {
      const msg = errorMessage(e);
      log("error", "action", "modbus_write", `Write failed: ${msg}`);
      set({ writeError: msg, isWriting: false });
      toast.error("Write Failed", msg);
    }
  },

  clearValues: () => set({ values: [], writeResults: [] }),
  clearErrors: () => set({ readError: null, writeError: null }),
}));
