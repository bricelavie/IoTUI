import React, { useState, useEffect } from "react";
import { useSettingsStore, type AppSettings } from "@/stores/settingsStore";
import { Button, Card, ThemeSelector } from "@/components/ui/index";
import { RotateCcw, ScrollText, Bell, Activity, Palette, Radio, Server, Network } from "lucide-react";

// ─── Setting field component ─────────────────────────────────────

interface NumberFieldProps {
  label: string;
  description: string;
  value: number;
  onChange: (v: number) => void;
  min?: number;
  max?: number;
  step?: number;
  suffix?: string;
}

const NumberField: React.FC<NumberFieldProps> = ({
  label,
  description,
  value,
  onChange,
  min = 0,
  max,
  step = 1,
  suffix,
}) => {
  const [draft, setDraft] = useState(String(value));
  const [focused, setFocused] = useState(false);

  // Sync external value changes when not actively editing
  useEffect(() => {
    if (!focused) setDraft(String(value));
  }, [value, focused]);

  const commit = () => {
    const n = Number(draft);
    if (!isNaN(n) && n >= min && (max === undefined || n <= max)) {
      onChange(n);
    } else {
      // Revert to last valid value
      setDraft(String(value));
    }
  };

  return (
    <div className="flex items-start justify-between gap-4 py-2">
      <div className="flex-1 min-w-0">
        <div className="text-xs font-medium text-iot-text-secondary">{label}</div>
        <div className="text-2xs text-iot-text-muted mt-0.5">{description}</div>
      </div>
      <div className="flex items-center gap-1.5 flex-shrink-0">
        <input
          type="number"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onFocus={() => setFocused(true)}
          onBlur={() => { setFocused(false); commit(); }}
          onKeyDown={(e) => { if (e.key === "Enter") { e.currentTarget.blur(); } }}
          min={min}
          max={max}
          step={step}
          className="w-24 bg-iot-bg-base border border-iot-border rounded px-2 py-1 text-xs text-iot-text-primary text-center focus:outline-none focus:border-iot-border-focus focus:ring-1 focus:ring-iot-border-focus/30 transition-colors settings-number-input"
        />
        <span className="text-2xs text-iot-text-disabled w-6">{suffix ?? ""}</span>
      </div>
    </div>
  );
};

interface ToggleFieldProps {
  label: string;
  description: string;
  value: boolean;
  onChange: (v: boolean) => void;
}

const ToggleField: React.FC<ToggleFieldProps> = ({
  label,
  description,
  value,
  onChange,
}) => (
  <div className="flex items-start justify-between gap-4 py-2">
    <div className="flex-1 min-w-0">
      <div className="text-xs font-medium text-iot-text-secondary">{label}</div>
      <div className="text-2xs text-iot-text-muted mt-0.5">{description}</div>
    </div>
    <div className="flex items-center gap-1.5 flex-shrink-0">
      <div className="w-24 flex justify-end">
        <button
          role="switch"
          aria-checked={value}
          onClick={() => onChange(!value)}
          className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-iot-border-focus focus-visible:ring-offset-1 focus-visible:ring-offset-iot-bg-base ${
            value
              ? "bg-iot-cyan/30 border border-iot-cyan/50"
              : "bg-iot-bg-elevated border border-iot-border"
          }`}
        >
          <span
            className={`inline-block h-3 w-3 rounded-full transition-transform ${
              value
                ? "translate-x-[18px] bg-iot-cyan"
                : "translate-x-1 bg-iot-text-disabled"
            }`}
          />
        </button>
      </div>
      <span className="w-6" />
    </div>
  </div>
);

interface SelectFieldProps {
  label: string;
  description: string;
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
}

const SelectField: React.FC<SelectFieldProps> = ({
  label,
  description,
  value,
  onChange,
  options,
}) => (
  <div className="flex items-start justify-between gap-4 py-2">
    <div className="flex-1 min-w-0">
      <div className="text-xs font-medium text-iot-text-secondary">{label}</div>
      <div className="text-2xs text-iot-text-muted mt-0.5">{description}</div>
    </div>
    <div className="flex items-center gap-1.5 flex-shrink-0">
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-24 bg-iot-bg-base border border-iot-border rounded px-2 py-1 text-xs text-iot-text-primary text-center focus:outline-none focus:border-iot-border-focus focus:ring-1 focus:ring-iot-border-focus/30 transition-colors appearance-none cursor-pointer"
      >
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
      <span className="w-6" />
    </div>
  </div>
);

// ─── Section component ───────────────────────────────────────────

interface SectionProps {
  icon: React.ReactNode;
  title: string;
  children: React.ReactNode;
}

const Section: React.FC<SectionProps> = ({ icon, title, children }) => (
  <Card className="p-4">
    <h3 className="text-sm font-semibold text-iot-text-primary mb-3 flex items-center gap-2">
      <span className="text-iot-cyan">{icon}</span>
      {title}
    </h3>
    <div className="space-y-3">{children}</div>
  </Card>
);

// ─── Main panel ──────────────────────────────────────────────────

export const SettingsPanel: React.FC = () => {
  const settings = useSettingsStore();
  const update = useSettingsStore((s) => s.update);
  const reset = useSettingsStore((s) => s.reset);

  const set = <K extends keyof AppSettings>(key: K) => (value: AppSettings[K]) =>
    update({ [key]: value });

  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 overflow-auto p-3">
        <div className="max-w-5xl w-full mx-auto space-y-4">
          <div className="flex justify-end">
            <Button variant="ghost" size="xs" onClick={reset}>
              <RotateCcw size={12} />
              Reset Defaults
            </Button>
          </div>

          {/* Appearance */}
          <Section icon={<Palette size={14} />} title="Appearance">
            <div className="flex items-start justify-between gap-4 py-2">
              <div className="flex-1 min-w-0">
                <div className="text-xs font-medium text-iot-text-secondary">Theme</div>
                <div className="text-2xs text-iot-text-muted mt-0.5">Choose a color scheme for the interface</div>
              </div>
              <div className="flex items-center gap-1.5 flex-shrink-0">
                <ThemeSelector />
                <span className="w-6" />
              </div>
            </div>
          </Section>

          {/* OPC UA - Subscriptions */}
          <Section icon={<Network size={14} />} title="OPC UA - Subscriptions">
            <NumberField
              label="Max History Points"
              description="Maximum data points retained per monitored node for charts and statistics"
              value={settings.maxHistoryPoints}
              onChange={set("maxHistoryPoints")}
              min={10}
              max={10000}
              step={10}
              suffix="pts"
            />
            <NumberField
              label="Default Publishing Interval"
              description="Default interval for new subscriptions (server may revise)"
              value={settings.defaultPublishingInterval}
              onChange={set("defaultPublishingInterval")}
              min={50}
              max={60000}
              step={50}
              suffix="ms"
            />
            <NumberField
              label="Default Sampling Interval"
              description="Default sampling interval for new monitored items"
              value={settings.defaultSamplingInterval}
              onChange={set("defaultSamplingInterval")}
              min={50}
              max={60000}
              step={50}
              suffix="ms"
            />
            <NumberField
              label="Default Queue Size"
              description="Default queue size for new monitored items"
              value={settings.defaultQueueSize}
              onChange={set("defaultQueueSize")}
              min={1}
              max={1000}
            />
          </Section>

          {/* OPC UA - Events */}
          <Section icon={<Activity size={14} />} title="OPC UA - Events">
            <NumberField
              label="Max Event Entries"
              description="Maximum events retained in the event viewer"
              value={settings.maxEventEntries}
              onChange={set("maxEventEntries")}
              min={50}
              max={10000}
              step={50}
            />
            <NumberField
              label="Event Poll Interval"
              description="How often the event viewer polls for new OPC UA events"
              value={settings.eventPollInterval}
              onChange={set("eventPollInterval")}
              min={500}
              max={30000}
              step={500}
              suffix="ms"
            />
          </Section>

          {/* MQTT - Subscriptions & Messages */}
          <Section icon={<Radio size={14} />} title="MQTT - Subscriptions & Messages">
            <SelectField
              label="Default QoS"
              description="Default Quality of Service level for new MQTT subscriptions"
              value={String(settings.mqttDefaultQoS)}
              onChange={(v) => set("mqttDefaultQoS")(Number(v))}
              options={[
                { value: "0", label: "QoS 0" },
                { value: "1", label: "QoS 1" },
                { value: "2", label: "QoS 2" },
              ]}
            />
            <NumberField
              label="Message Poll Interval"
              description="How often the frontend polls for new MQTT messages"
              value={settings.mqttPollInterval}
              onChange={set("mqttPollInterval")}
              min={100}
              max={30000}
              step={100}
              suffix="ms"
            />
            <NumberField
              label="Max Messages per Topic"
              description="Maximum messages retained per topic in the topic explorer"
              value={settings.mqttMaxMessagesPerTopic}
              onChange={set("mqttMaxMessagesPerTopic")}
              min={10}
              max={10000}
              step={10}
            />
            <NumberField
              label="Max Stream Messages"
              description="Maximum total messages retained in the message stream view"
              value={settings.mqttMaxStreamMessages}
              onChange={set("mqttMaxStreamMessages")}
              min={100}
              max={50000}
              step={100}
            />
          </Section>

          {/* MQTT - Broker */}
          <Section icon={<Server size={14} />} title="MQTT - Broker">
            <NumberField
              label="Broker Stats Poll Interval"
              description="How often the broker admin panel polls for updated statistics"
              value={settings.mqttBrokerStatsPollInterval}
              onChange={set("mqttBrokerStatsPollInterval")}
              min={500}
              max={30000}
              step={500}
              suffix="ms"
            />
          </Section>

          {/* Logging */}
          <Section icon={<ScrollText size={14} />} title="Logging">
            <NumberField
              label="Max Log Entries"
              description="Maximum log entries retained in the log panel (frontend ring buffer)"
              value={settings.maxLogEntries}
              onChange={set("maxLogEntries")}
              min={100}
              max={50000}
              step={100}
            />
            <NumberField
              label="Backend Log Poll Interval"
              description="How often the frontend polls for new backend log entries"
              value={settings.backendLogPollInterval}
              onChange={set("backendLogPollInterval")}
              min={500}
              max={30000}
              step={500}
              suffix="ms"
            />
            <ToggleField
              label="Log IPC Polling"
              description="Log high-frequency IPC poll commands. Disable to reduce noise."
              value={settings.logIpcPolling}
              onChange={set("logIpcPolling")}
            />
            <NumberField
              label="IPC Result Truncation"
              description="Maximum characters shown for IPC result details in log entries"
              value={settings.ipcResultTruncation}
              onChange={set("ipcResultTruncation")}
              min={100}
              max={10000}
              step={100}
              suffix="chr"
            />
          </Section>

          {/* Notifications */}
          <Section icon={<Bell size={14} />} title="Notifications">
            <NumberField
              label="Error Toast Duration"
              description="How long error toast notifications stay visible"
              value={settings.errorToastDuration}
              onChange={set("errorToastDuration")}
              min={1000}
              max={30000}
              step={500}
              suffix="ms"
            />
            <NumberField
              label="Normal Toast Duration"
              description="How long success/info/warning toast notifications stay visible"
              value={settings.normalToastDuration}
              onChange={set("normalToastDuration")}
              min={1000}
              max={30000}
              step={500}
              suffix="ms"
            />
          </Section>

          <p className="text-2xs text-iot-text-disabled text-center pt-2 pb-4">
            Settings are applied immediately and now persist across app restarts.
          </p>
        </div>
      </div>
    </div>
  );
};
