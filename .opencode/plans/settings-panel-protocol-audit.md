# Settings Panel Protocol Audit & Refactor

## Problem

The `SettingsPanel.tsx` has two issues:
1. **5 MQTT settings exist in the store but have zero UI** — users can't configure them
2. **No protocol labeling** — OPC UA-specific settings aren't labeled as such, causing confusion

## Current Settings Inventory

### In store but NO UI (the gap):
- `mqttDefaultQoS` (0/1/2) — used by `mqttSubscriptionStore.ts:58`
- `mqttPollInterval` (ms) — used by `mqttSubscriptionStore.ts:96`
- `mqttMaxMessagesPerTopic` — used by `mqttTopicStore.ts:78`
- `mqttMaxStreamMessages` — used by `mqttSubscriptionStore.ts:97`
- `mqttBrokerStatsPollInterval` (ms) — used by `mqttBrokerStore.ts:53`

### In store AND in UI (no changes needed to store):
- All OPC UA settings (maxHistoryPoints, defaultPublishingInterval, defaultSamplingInterval, defaultQueueSize, maxEventEntries, eventPollInterval)
- All shared settings (maxLogEntries, backendLogPollInterval, logIpcPolling, ipcResultTruncation, errorToastDuration, normalToastDuration)

## Plan — Single file change: `src/components/opcua/SettingsPanel.tsx`

### 1. Update imports (line 4)

**Before:**
```tsx
import { RotateCcw, Database, ScrollText, Bell, Activity, Palette } from "lucide-react";
```

**After:**
```tsx
import { RotateCcw, Database, ScrollText, Bell, Activity, Palette, Radio, Server, MessageSquare, Network } from "lucide-react";
```

### 2. Add a `SelectField` sub-component (after `ToggleField`, around line 96)

```tsx
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
        className="w-24 bg-iot-bg-base border border-iot-border rounded px-2 py-1 text-xs text-iot-text-primary text-right focus:outline-none focus:border-iot-border-focus focus:ring-1 focus:ring-iot-border-focus/30 transition-colors appearance-none cursor-pointer"
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
```

### 3. Rename existing sections and add MQTT sections

Replace the entire JSX content inside `<div className="max-w-5xl ...">` with:

**Section order:**
1. Appearance (unchanged, shared)
2. **OPC UA: Subscriptions** (renamed from "Data & Subscriptions", icon: `<Network>`)
3. **OPC UA: Events** (renamed from "Events", icon stays `<Activity>`)
4. **MQTT: Subscriptions & Messages** (NEW, icon: `<Radio>`)
5. **MQTT: Broker** (NEW, icon: `<Server>`)
6. Logging (unchanged, shared)
7. Notifications (unchanged, shared)

### New MQTT sections JSX:

```tsx
{/* MQTT: Subscriptions & Messages */}
<Section icon={<Radio size={14} />} title="MQTT: Subscriptions & Messages">
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

{/* MQTT: Broker */}
<Section icon={<Server size={14} />} title="MQTT: Broker">
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
```

### 4. Rename existing section titles

- "Data & Subscriptions" → "OPC UA: Subscriptions"
  - Change icon from `<Database>` to `<Network>`
- "Events" → "OPC UA: Events"
  - Icon stays `<Activity>`

## Files Modified

| File | Change |
|------|--------|
| `src/components/opcua/SettingsPanel.tsx` | Add imports, SelectField component, MQTT sections, rename OPC UA sections |

## No store changes needed

All 5 MQTT settings already exist in `settingsStore.ts` with proper defaults:
- `mqttDefaultQoS: 0`
- `mqttPollInterval: 500`
- `mqttMaxMessagesPerTopic: 100`
- `mqttMaxStreamMessages: 1000`
- `mqttBrokerStatsPollInterval: 3000`

## Verification

Run `npm run build` to ensure no compile errors.
