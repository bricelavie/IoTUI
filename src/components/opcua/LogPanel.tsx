import React, { useMemo, useRef, useEffect, useState, useCallback } from "react";
import { clsx } from "clsx";
import { useLogStore } from "@/stores/logStore";
import { Badge, EmptyState, Button } from "@/components/ui";
import {
  ScrollText,
  Pause,
  Play,
  Trash2,
  Filter,
  Download,
  ChevronDown,
  ChevronRight,
  ArrowDownToLine,
  Settings2,
  Search,
  X,
} from "lucide-react";
import { invoke } from "@tauri-apps/api/core";
import type { LogLevel, LogCategory, LogEntry } from "@/types/opcua";

// ─── Helpers ─────────────────────────────────────────────────────

const LEVEL_CONFIG: Record<LogLevel, { label: string; color: string; badge: "danger" | "warning" | "info" | "default" | "success"; bar: string }> = {
  error: { label: "ERR", color: "text-iot-red", badge: "danger", bar: "bg-iot-red" },
  warn:  { label: "WRN", color: "text-iot-amber", badge: "warning", bar: "bg-iot-amber" },
  info:  { label: "INF", color: "text-iot-cyan", badge: "info", bar: "bg-iot-cyan" },
  debug: { label: "DBG", color: "text-iot-text-muted", badge: "default", bar: "bg-iot-text-disabled" },
  trace: { label: "TRC", color: "text-iot-text-disabled", badge: "default", bar: "bg-iot-text-disabled/50" },
};

const CATEGORY_CONFIG: Record<LogCategory, { label: string; color: string }> = {
  ipc:          { label: "IPC", color: "text-violet-400" },
  backend:      { label: "BACK", color: "text-emerald-400" },
  subscription: { label: "SUB", color: "text-sky-400" },
  connection:   { label: "CONN", color: "text-amber-400" },
  action:       { label: "ACT", color: "text-pink-400" },
};

const ALL_LEVELS: LogLevel[] = ["error", "warn", "info", "debug", "trace"];
const ALL_CATEGORIES: LogCategory[] = ["ipc", "backend", "subscription", "connection", "action"];

const BACKEND_LEVELS = ["error", "warn", "info", "debug", "trace"];

function formatTimestamp(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleTimeString(undefined, {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      fractionalSecondDigits: 3,
    });
  } catch {
    return iso;
  }
}

// ─── Component ───────────────────────────────────────────────────

export const LogPanel: React.FC = () => {
  const {
    entries,
    levelFilter,
    categoryFilter,
    searchQuery,
    isPaused,
    autoScroll,
    setLevelFilter,
    setCategoryFilter,
    setSearchQuery,
    togglePause,
    toggleAutoScroll,
    clear,
    exportLogs,
  } = useLogStore();

  const [showFilterPanel, setShowFilterPanel] = useState(false);
  const [expandedIds, setExpandedIds] = useState<Set<number>>(new Set());
  const [backendLevel, setBackendLevel] = useState("info");
  const [showLevelMenu, setShowLevelMenu] = useState(false);
  const tableTopRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to top (newest entries)
  useEffect(() => {
    if (autoScroll && tableTopRef.current) {
      tableTopRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [entries.length, autoScroll]);

  // Filtered entries (newest first)
  const filteredEntries = useMemo(() => {
    const filtered = entries.filter((e) => {
      if (levelFilter !== "all" && e.level !== levelFilter) return false;
      if (categoryFilter !== "all" && e.category !== categoryFilter) return false;
      if (searchQuery) {
        const q = searchQuery.toLowerCase();
        return (
          e.message.toLowerCase().includes(q) ||
          e.source.toLowerCase().includes(q) ||
          (e.details && e.details.toLowerCase().includes(q))
        );
      }
      return true;
    });
    return filtered.slice().reverse();
  }, [entries, levelFilter, categoryFilter, searchQuery]);

  // Stats
  const stats = useMemo(() => {
    const counts: Record<LogLevel, number> = { error: 0, warn: 0, info: 0, debug: 0, trace: 0 };
    for (const e of entries) {
      counts[e.level]++;
    }
    return { ...counts, total: entries.length };
  }, [entries]);

  const toggleExpanded = useCallback((id: number) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const handleExport = useCallback(() => {
    const json = exportLogs();
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `iotui-logs-${new Date().toISOString().slice(0, 19)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }, [exportLogs]);

  const handleSetBackendLevel = useCallback(async (level: string) => {
    try {
      const result: string = await invoke("opcua_set_log_level", { level });
      setBackendLevel(result);
    } catch {
      // ignore
    }
    setShowLevelMenu(false);
  }, []);

  return (
    <div className="h-full flex flex-col">
      {/* Header bar */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-iot-border flex-shrink-0">
        <div className="flex items-center gap-2">
          <ScrollText size={14} className="text-iot-cyan" />
          <span className="text-xs font-semibold text-iot-text-secondary uppercase tracking-wider">
            Application Logs
          </span>
          <Badge variant="info">{stats.total} total</Badge>
          {stats.error > 0 && <Badge variant="danger">{stats.error} errors</Badge>}
          {stats.warn > 0 && <Badge variant="warning">{stats.warn} warnings</Badge>}
        </div>
        <div className="flex items-center gap-2">
          {/* Backend level selector */}
          <div className="relative">
            <Button
              variant="ghost"
              size="xs"
              onClick={() => setShowLevelMenu(!showLevelMenu)}
            >
              <Settings2 size={12} />
              Backend: {backendLevel}
            </Button>
            {showLevelMenu && (
              <div className="absolute right-0 top-full mt-1 z-20 bg-iot-bg-elevated border border-iot-border rounded shadow-lg py-1 min-w-[100px]">
                {BACKEND_LEVELS.map((l) => (
                  <button
                    key={l}
                    onClick={() => handleSetBackendLevel(l)}
                    className={clsx(
                      "block w-full text-left px-3 py-1 text-2xs transition-colors",
                      l === backendLevel
                        ? "text-iot-cyan bg-iot-cyan/10"
                        : "text-iot-text-secondary hover:bg-iot-bg-hover"
                    )}
                  >
                    {l}
                  </button>
                ))}
              </div>
            )}
          </div>

          <Button
            variant="ghost"
            size="xs"
            onClick={() => setShowFilterPanel(!showFilterPanel)}
            className={showFilterPanel ? "text-iot-cyan" : ""}
          >
            <Filter size={12} />
            Filter
          </Button>
          <Button variant="ghost" size="xs" onClick={togglePause}>
            {isPaused ? <Play size={12} /> : <Pause size={12} />}
            {isPaused ? "Resume" : "Pause"}
          </Button>
          <Button
            variant="ghost"
            size="xs"
            onClick={toggleAutoScroll}
            className={autoScroll ? "text-iot-cyan" : ""}
          >
            <ArrowDownToLine size={12} />
          </Button>
          <Button variant="ghost" size="xs" onClick={handleExport}>
            <Download size={12} />
          </Button>
          <Button variant="ghost" size="xs" onClick={clear}>
            <Trash2 size={12} />
          </Button>
          {!isPaused && (
            <span className="flex items-center gap-1 text-2xs text-iot-cyan">
              <span className="w-1.5 h-1.5 rounded-full bg-iot-cyan animate-pulse-slow" />
              LIVE
            </span>
          )}
        </div>
      </div>

      {/* Filter panel */}
      {showFilterPanel && (
        <div className="flex items-center gap-4 px-4 py-2 border-b border-iot-border bg-iot-bg-surface/50 flex-shrink-0 flex-wrap">
          {/* Level filter */}
          <div className="flex items-center gap-1.5">
            <span className="text-2xs text-iot-text-disabled uppercase tracking-wider">Level:</span>
            <button
              onClick={() => setLevelFilter("all")}
              className={clsx(
                "px-2 py-0.5 rounded text-2xs font-medium transition-colors border",
                levelFilter === "all"
                  ? "bg-iot-cyan/10 text-iot-cyan border-iot-cyan/20"
                  : "text-iot-text-muted hover:text-iot-text-secondary border-transparent"
              )}
            >
              All
            </button>
            {ALL_LEVELS.map((l) => (
              <button
                key={l}
                onClick={() => setLevelFilter(l)}
                className={clsx(
                  "px-2 py-0.5 rounded text-2xs font-medium transition-colors border",
                  levelFilter === l
                    ? "bg-iot-cyan/10 text-iot-cyan border-iot-cyan/20"
                    : "text-iot-text-muted hover:text-iot-text-secondary border-transparent"
                )}
              >
                {LEVEL_CONFIG[l].label}
              </button>
            ))}
          </div>

          {/* Category filter */}
          <div className="flex items-center gap-1.5">
            <span className="text-2xs text-iot-text-disabled uppercase tracking-wider">Category:</span>
            <button
              onClick={() => setCategoryFilter("all")}
              className={clsx(
                "px-2 py-0.5 rounded text-2xs font-medium transition-colors border",
                categoryFilter === "all"
                  ? "bg-iot-cyan/10 text-iot-cyan border-iot-cyan/20"
                  : "text-iot-text-muted hover:text-iot-text-secondary border-transparent"
              )}
            >
              All
            </button>
            {ALL_CATEGORIES.map((c) => (
              <button
                key={c}
                onClick={() => setCategoryFilter(c)}
                className={clsx(
                  "px-2 py-0.5 rounded text-2xs font-medium transition-colors border",
                  categoryFilter === c
                    ? "bg-iot-cyan/10 text-iot-cyan border-iot-cyan/20"
                    : "text-iot-text-muted hover:text-iot-text-secondary border-transparent"
                )}
              >
                {CATEGORY_CONFIG[c].label}
              </button>
            ))}
          </div>

          {/* Search */}
          <div className="flex items-center gap-1.5 ml-auto">
            <div className="relative">
              <Search size={12} className="absolute left-2 top-1/2 -translate-y-1/2 text-iot-text-disabled" />
              <input
                type="text"
                placeholder="Search logs..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="bg-iot-bg-base border border-iot-border rounded pl-7 pr-6 py-0.5 text-2xs text-iot-text-secondary focus:outline-none focus:border-iot-border-focus w-48"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery("")}
                  className="absolute right-1.5 top-1/2 -translate-y-1/2 text-iot-text-disabled hover:text-iot-text-secondary"
                >
                  <X size={10} />
                </button>
              )}
            </div>
            <span className="text-2xs text-iot-text-disabled">
              {filteredEntries.length} of {entries.length}
            </span>
          </div>
        </div>
      )}

      {/* Log table */}
      {filteredEntries.length === 0 ? (
        <div className="flex-1 flex items-center justify-center">
          <EmptyState
            icon={<ScrollText size={32} />}
            title={entries.length === 0 ? "No Logs Yet" : "No Matching Logs"}
            description={
              entries.length === 0
                ? "Application logs will appear here as you interact with the app"
                : "Adjust your filters to see more logs"
            }
          />
        </div>
      ) : (
        <div className="flex-1 overflow-auto">
          <div ref={tableTopRef} />
          <table className="w-full text-xs">
            <thead className="sticky top-0 bg-iot-bg-surface z-10">
              <tr className="border-b border-iot-border text-left">
                <th className="w-1 px-0" />
                <th className="w-5 px-1" />
                <th className="px-3 py-2 text-2xs font-semibold text-iot-text-disabled uppercase tracking-wider">
                  Time
                </th>
                <th className="px-3 py-2 text-2xs font-semibold text-iot-text-disabled uppercase tracking-wider">
                  Level
                </th>
                <th className="px-3 py-2 text-2xs font-semibold text-iot-text-disabled uppercase tracking-wider">
                  Category
                </th>
                <th className="px-3 py-2 text-2xs font-semibold text-iot-text-disabled uppercase tracking-wider">
                  Source
                </th>
                <th className="px-3 py-2 text-2xs font-semibold text-iot-text-disabled uppercase tracking-wider flex-1">
                  Message
                </th>
                <th className="px-3 py-2 text-2xs font-semibold text-iot-text-disabled uppercase tracking-wider text-right">
                  Duration
                </th>
              </tr>
            </thead>
            <tbody>
              {filteredEntries.map((entry) => {
                const lc = LEVEL_CONFIG[entry.level];
                const cc = CATEGORY_CONFIG[entry.category];
                const hasDetails = !!entry.details;
                const isExpanded = expandedIds.has(entry.id);

                return (
                  <React.Fragment key={entry.id}>
                    <tr
                      className={clsx(
                        "border-b border-iot-border/50 hover:bg-iot-bg-hover transition-colors",
                        hasDetails && "cursor-pointer"
                      )}
                      onClick={() => hasDetails && toggleExpanded(entry.id)}
                    >
                      {/* Level color bar */}
                      <td className="w-1 px-0">
                        <div className={clsx("w-0.5 h-full min-h-[2rem]", lc.bar)} />
                      </td>
                      {/* Expand chevron */}
                      <td className="w-5 px-1 text-center">
                        {hasDetails && (
                          <span className="text-iot-text-disabled">
                            {isExpanded ? <ChevronDown size={10} /> : <ChevronRight size={10} />}
                          </span>
                        )}
                      </td>
                      {/* Timestamp */}
                      <td className="px-3 py-1.5 whitespace-nowrap">
                        <span className="font-mono text-2xs text-iot-text-disabled">
                          {formatTimestamp(entry.timestamp)}
                        </span>
                      </td>
                      {/* Level */}
                      <td className="px-3 py-1.5">
                        <Badge variant={lc.badge}>{lc.label}</Badge>
                      </td>
                      {/* Category */}
                      <td className="px-3 py-1.5">
                        <span className={clsx("font-mono text-2xs font-semibold", cc.color)}>
                          {cc.label}
                        </span>
                      </td>
                      {/* Source */}
                      <td className="px-3 py-1.5">
                        <span className="text-iot-text-secondary font-medium text-2xs truncate max-w-[140px] inline-block">
                          {entry.source}
                        </span>
                      </td>
                      {/* Message */}
                      <td className="px-3 py-1.5">
                        <span className={clsx("text-2xs", lc.color)}>{entry.message}</span>
                      </td>
                      {/* Duration */}
                      <td className="px-3 py-1.5 text-right whitespace-nowrap">
                        {entry.duration !== undefined && (
                          <span
                            className={clsx(
                              "font-mono text-2xs",
                              entry.duration > 1000
                                ? "text-iot-red"
                                : entry.duration > 200
                                ? "text-iot-amber"
                                : "text-iot-text-disabled"
                            )}
                          >
                            {entry.duration}ms
                          </span>
                        )}
                      </td>
                    </tr>
                    {/* Expanded detail row */}
                    {isExpanded && hasDetails && (
                      <tr className="border-b border-iot-border/50 bg-iot-bg-elevated/50">
                        <td colSpan={8} className="px-8 py-2">
                          <pre className="text-2xs text-iot-text-muted font-mono whitespace-pre-wrap break-all max-h-40 overflow-auto">
                            {entry.details}
                          </pre>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Footer stats bar */}
      <div className="flex items-center gap-4 px-4 py-1.5 border-t border-iot-border bg-iot-bg-surface/50 flex-shrink-0 text-2xs text-iot-text-disabled">
        <span className="flex items-center gap-1">
          <span className="w-2 h-2 rounded-sm bg-iot-red" /> Errors: {stats.error}
        </span>
        <span className="flex items-center gap-1">
          <span className="w-2 h-2 rounded-sm bg-iot-amber" /> Warnings: {stats.warn}
        </span>
        <span className="flex items-center gap-1">
          <span className="w-2 h-2 rounded-sm bg-iot-cyan" /> Info: {stats.info}
        </span>
        <span className="flex items-center gap-1">
          <span className="w-2 h-2 rounded-sm bg-iot-text-disabled" /> Debug: {stats.debug}
        </span>
        <span className="flex items-center gap-1">
          <span className="w-2 h-2 rounded-sm bg-iot-text-disabled/50" /> Trace: {stats.trace}
        </span>
        <span className="ml-auto">
          Buffer: {entries.length}/2000
        </span>
        {isPaused && (
          <span className="text-iot-amber font-semibold">PAUSED</span>
        )}
      </div>
    </div>
  );
};
