import React, { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { useConnectionStore } from "@/stores/connectionStore";
import { Badge, EmptyState, Button } from "@/components/ui";
import { AlertTriangle, Pause, Play, Trash2, Filter, ChevronDown } from "lucide-react";
import * as opcua from "@/services/opcua";
import { useSettingsStore } from "@/stores/settingsStore";
import type { EventData } from "@/types/opcua";

type SeverityFilter = "all" | "low" | "medium" | "high" | "critical";

function severityCategory(severity: number): SeverityFilter {
  if (severity >= 800) return "critical";
  if (severity >= 500) return "high";
  if (severity >= 200) return "medium";
  return "low";
}

function severityColor(severity: number): string {
  if (severity >= 800) return "text-iot-red";
  if (severity >= 500) return "text-iot-amber";
  if (severity >= 200) return "text-iot-cyan";
  return "text-iot-text-muted";
}

function severityBadgeVariant(severity: number): "danger" | "warning" | "info" | "default" {
  if (severity >= 800) return "danger";
  if (severity >= 500) return "warning";
  if (severity >= 200) return "info";
  return "default";
}

function severityBarColor(severity: number): string {
  if (severity >= 800) return "bg-iot-red";
  if (severity >= 500) return "bg-iot-amber";
  if (severity >= 200) return "bg-iot-cyan";
  return "bg-iot-text-disabled";
}

export const EventViewer: React.FC = () => {
  const { activeConnectionId } = useConnectionStore();
  const maxEventEntries = useSettingsStore((s) => s.maxEventEntries);
  const eventPollInterval = useSettingsStore((s) => s.eventPollInterval);
  const [events, setEvents] = useState<EventData[]>([]);
  const [isPolling, setIsPolling] = useState(true);
  const [filter, setFilter] = useState<SeverityFilter>("all");
  const [sourceFilter, setSourceFilter] = useState<string>("all");
  const [showFilterPanel, setShowFilterPanel] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const inFlightRef = useRef(false);

  const pollEvents = useCallback(async () => {
    if (!activeConnectionId) return;
    if (inFlightRef.current) return;
    inFlightRef.current = true;
    try {
      const newEvents = await opcua.pollEvents(activeConnectionId);
      setEvents((prev) => {
        const combined = [...newEvents, ...prev];
        return combined.slice(0, maxEventEntries);
      });
    } catch {
      // Silently ignore poll errors
    } finally {
      inFlightRef.current = false;
    }
  }, [activeConnectionId, maxEventEntries]);

  useEffect(() => {
    if (isPolling && activeConnectionId) {
      // Initial poll
      pollEvents();
      intervalRef.current = setInterval(pollEvents, eventPollInterval);
    }
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [isPolling, activeConnectionId, pollEvents, eventPollInterval]);

  const uniqueSources = useMemo(() => {
    const sources = new Set(events.map((e) => e.source_name));
    return Array.from(sources).sort();
  }, [events]);

  const filteredEvents = useMemo(() => {
    return events.filter((e) => {
      if (filter !== "all" && severityCategory(e.severity) !== filter) return false;
      if (sourceFilter !== "all" && e.source_name !== sourceFilter) return false;
      return true;
    });
  }, [events, filter, sourceFilter]);

  const clearEvents = () => setEvents([]);

  const stats = useMemo(() => {
    let critical = 0, high = 0, medium = 0, low = 0;
    for (const e of events) {
      const cat = severityCategory(e.severity);
      if (cat === "critical") critical++;
      else if (cat === "high") high++;
      else if (cat === "medium") medium++;
      else low++;
    }
    return { critical, high, medium, low, total: events.length };
  }, [events]);

  if (!activeConnectionId) {
    return (
      <div className="h-full flex items-center justify-center">
        <EmptyState
          icon={<AlertTriangle size={32} />}
          title="Not Connected"
          description="Connect to a server to view events"
        />
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col">
      {/* Header bar */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-iot-border flex-shrink-0">
        <div className="flex items-center gap-2">
          <AlertTriangle size={14} className="text-iot-amber" />
          <span className="text-xs font-semibold text-iot-text-secondary uppercase tracking-wider">
            Alarms & Events
          </span>
          <Badge variant="info">{stats.total} total</Badge>
          {stats.critical > 0 && <Badge variant="danger">{stats.critical} critical</Badge>}
          {stats.high > 0 && <Badge variant="warning">{stats.high} high</Badge>}
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="xs"
            onClick={() => setShowFilterPanel(!showFilterPanel)}
            className={showFilterPanel ? "text-iot-cyan" : ""}
          >
            <Filter size={12} />
            Filter
          </Button>
          <Button
            variant="ghost"
            size="xs"
            onClick={() => setIsPolling(!isPolling)}
          >
            {isPolling ? <Pause size={12} /> : <Play size={12} />}
            {isPolling ? "Pause" : "Resume"}
          </Button>
          <Button variant="ghost" size="xs" onClick={clearEvents}>
            <Trash2 size={12} />
            Clear
          </Button>
          {isPolling && (
            <span className="flex items-center gap-1 text-2xs text-iot-cyan">
              <span className="w-1.5 h-1.5 rounded-full bg-iot-cyan animate-pulse-slow" />
              LIVE
            </span>
          )}
        </div>
      </div>

      {/* Filter panel */}
      {showFilterPanel && (
        <div className="flex items-center gap-4 px-4 py-2 border-b border-iot-border bg-iot-bg-surface/50 flex-shrink-0">
          <div className="flex items-center gap-1.5">
            <span className="text-2xs text-iot-text-disabled uppercase tracking-wider">Severity:</span>
            {(["all", "critical", "high", "medium", "low"] as SeverityFilter[]).map((f) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={`px-2 py-0.5 rounded text-2xs font-medium transition-colors ${
                  filter === f
                    ? "bg-iot-cyan/10 text-iot-cyan border border-iot-cyan/20"
                    : "text-iot-text-muted hover:text-iot-text-secondary border border-transparent"
                }`}
              >
                {f === "all" ? "All" : f.charAt(0).toUpperCase() + f.slice(1)}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-1.5">
            <span className="text-2xs text-iot-text-disabled uppercase tracking-wider">Source:</span>
            <select
              value={sourceFilter}
              onChange={(e) => setSourceFilter(e.target.value)}
              className="bg-iot-bg-base border border-iot-border rounded px-2 py-0.5 text-2xs text-iot-text-secondary focus:outline-none focus:border-iot-border-focus"
            >
              <option value="all">All Sources</option>
              {uniqueSources.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </div>
          <span className="text-2xs text-iot-text-disabled ml-auto">
            Showing {filteredEvents.length} of {events.length}
          </span>
        </div>
      )}

      {/* Event table */}
      {filteredEvents.length === 0 ? (
        <div className="flex-1 flex items-center justify-center">
          <EmptyState
            icon={<AlertTriangle size={32} />}
            title={events.length === 0 ? "No Events Yet" : "No Matching Events"}
            description={
              events.length === 0
                ? "Events will appear here as they are generated by the server"
                : "Adjust your filters to see more events"
            }
          />
        </div>
      ) : (
        <div className="flex-1 overflow-auto">
          <table className="w-full text-xs">
            <thead className="sticky top-0 bg-iot-bg-surface z-10">
              <tr className="border-b border-iot-border text-left">
                <th className="w-1 px-0" />
                <th className="px-3 py-2 text-2xs font-semibold text-iot-text-disabled uppercase tracking-wider">
                  Severity
                </th>
                <th className="px-3 py-2 text-2xs font-semibold text-iot-text-disabled uppercase tracking-wider">
                  Source
                </th>
                <th className="px-3 py-2 text-2xs font-semibold text-iot-text-disabled uppercase tracking-wider">
                  Type
                </th>
                <th className="px-3 py-2 text-2xs font-semibold text-iot-text-disabled uppercase tracking-wider flex-1">
                  Message
                </th>
                <th className="px-3 py-2 text-2xs font-semibold text-iot-text-disabled uppercase tracking-wider text-right">
                  Time
                </th>
              </tr>
            </thead>
            <tbody>
              {filteredEvents.map((event, idx) => (
                <tr
                  key={`${event.event_id}-${idx}`}
                  className="border-b border-iot-border/50 hover:bg-iot-bg-hover transition-colors"
                >
                  {/* Severity color bar */}
                  <td className="w-1 px-0">
                    <div className={`w-0.5 h-full min-h-[2rem] ${severityBarColor(event.severity)}`} />
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex items-center gap-1.5">
                      <Badge variant={severityBadgeVariant(event.severity)}>
                        {event.severity}
                      </Badge>
                    </div>
                  </td>
                  <td className="px-3 py-2">
                    <span className="text-iot-text-primary font-medium">{event.source_name}</span>
                  </td>
                  <td className="px-3 py-2">
                    <span className="text-iot-text-muted font-mono text-2xs">{event.event_type}</span>
                  </td>
                  <td className="px-3 py-2">
                    <span className={`${severityColor(event.severity)}`}>{event.message}</span>
                  </td>
                  <td className="px-3 py-2 text-right whitespace-nowrap">
                    <span className="font-mono text-2xs text-iot-text-disabled">
                      {new Date(event.timestamp).toLocaleTimeString()}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Footer stats bar */}
      <div className="flex items-center gap-4 px-4 py-1.5 border-t border-iot-border bg-iot-bg-surface/50 flex-shrink-0 text-2xs text-iot-text-disabled">
        <span className="flex items-center gap-1">
          <span className="w-2 h-2 rounded-sm bg-iot-red" /> Critical: {stats.critical}
        </span>
        <span className="flex items-center gap-1">
          <span className="w-2 h-2 rounded-sm bg-iot-amber" /> High: {stats.high}
        </span>
        <span className="flex items-center gap-1">
          <span className="w-2 h-2 rounded-sm bg-iot-cyan" /> Medium: {stats.medium}
        </span>
        <span className="flex items-center gap-1">
          <span className="w-2 h-2 rounded-sm bg-iot-text-disabled" /> Low: {stats.low}
        </span>
        <span className="ml-auto">
          Buffer: {events.length}/{maxEventEntries}
        </span>
      </div>
    </div>
  );
};
