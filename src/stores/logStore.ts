import { create } from "zustand";
import type { LogLevel, LogCategory, LogEntry } from "@/types/opcua";
import { getSetting } from "@/stores/settingsStore";

interface LogStore {
  // State
  entries: LogEntry[];
  levelFilter: LogLevel | "all";
  categoryFilter: LogCategory | "all";
  searchQuery: string;
  isPaused: boolean;
  autoScroll: boolean;
  nextId: number;

  // Actions
  addEntry: (entry: Omit<LogEntry, "id">) => void;
  addEntries: (entries: Omit<LogEntry, "id">[]) => void;
  setLevelFilter: (level: LogLevel | "all") => void;
  setCategoryFilter: (category: LogCategory | "all") => void;
  setSearchQuery: (query: string) => void;
  togglePause: () => void;
  toggleAutoScroll: () => void;
  clear: () => void;
  exportLogs: () => string;
}

export const useLogStore = create<LogStore>((set, get) => ({
  entries: [],
  levelFilter: "all",
  categoryFilter: "all",
  searchQuery: "",
  isPaused: false,
  autoScroll: true,
  nextId: 1,

  addEntry: (entry) => {
    const { isPaused, entries, nextId } = get();
    if (isPaused) return;

    const maxEntries = getSetting("maxLogEntries");
    const newEntry: LogEntry = { ...entry, id: nextId };
    const newEntries =
      entries.length >= maxEntries
        ? [...entries.slice(entries.length - maxEntries + 1), newEntry]
        : [...entries, newEntry];

    set({ entries: newEntries, nextId: nextId + 1 });
  },

  addEntries: (newRawEntries) => {
    if (newRawEntries.length === 0) return;
    const { isPaused, entries, nextId } = get();
    if (isPaused) return;

    const maxEntries = getSetting("maxLogEntries");
    let id = nextId;
    const tagged: LogEntry[] = newRawEntries.map((e) => ({ ...e, id: id++ }));
    const combined = [...entries, ...tagged];
    const trimmed =
      combined.length > maxEntries
        ? combined.slice(combined.length - maxEntries)
        : combined;

    set({ entries: trimmed, nextId: id });
  },

  setLevelFilter: (level) => set({ levelFilter: level }),
  setCategoryFilter: (category) => set({ categoryFilter: category }),
  setSearchQuery: (query) => set({ searchQuery: query }),
  togglePause: () => set((s) => ({ isPaused: !s.isPaused })),
  toggleAutoScroll: () => set((s) => ({ autoScroll: !s.autoScroll })),

  clear: () => set({ entries: [], nextId: 1 }),

  exportLogs: () => {
    const { entries } = get();
    return JSON.stringify(entries, null, 2);
  },
}));
