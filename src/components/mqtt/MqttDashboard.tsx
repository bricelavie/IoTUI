import React, { useMemo, useRef, useState, useEffect } from "react";
import { useMqttSubscriptionStore } from "@/stores/mqttSubscriptionStore";
import { useAppStore } from "@/stores/appStore";
import { Card, Badge, Button, EmptyState } from "@/components/ui";
import { LayoutDashboard, Activity } from "lucide-react";

interface NumericTopicData {
  topic: string;
  values: { timestamp: number; value: number }[];
  currentValue: number;
  min: number;
  max: number;
  avg: number;
  lastTimestamp: number;
}

/** Format a number smartly: 0 decimals for integers, 2 for small values, 1 for large. */
function smartFormat(value: number): string {
  if (Number.isInteger(value)) return value.toString();
  const abs = Math.abs(value);
  if (abs >= 1000) return value.toFixed(1);
  return value.toFixed(2);
}

/** Simple inline sparkline rendered with SVG polyline. Uses ResizeObserver for responsive width. */
const Sparkline: React.FC<{ data: number[]; height?: number; color?: string }> = ({
  data,
  height = 80,
  color = "#22d3ee",
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(200);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const w = entry.contentRect.width;
        if (w > 0) setWidth(w);
      }
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  if (data.length < 2) return null;
  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;
  const step = width / (data.length - 1);

  const points = data
    .map((v, i) => `${i * step},${height - ((v - min) / range) * (height - 4) - 2}`)
    .join(" ");

  return (
    <div ref={containerRef} className="w-full">
      <svg width={width} height={height} className="block">
        <polyline
          points={points}
          fill="none"
          stroke={color}
          strokeWidth="1.5"
          strokeLinejoin="round"
          strokeLinecap="round"
        />
      </svg>
    </div>
  );
};

export const MqttDashboard: React.FC = () => {
  const { messages } = useMqttSubscriptionStore();
  const { setActiveView } = useAppStore();

  // Extract numeric topics from recent messages
  const numericTopics = useMemo(() => {
    const topicMap = new Map<string, { timestamp: number; value: number }[]>();

    for (const msg of messages) {
      const num = parseFloat(msg.payload);
      if (Number.isNaN(num)) {
        // Try parsing JSON with a "value" field
        try {
          const parsed = JSON.parse(msg.payload);
          const val = typeof parsed === "number" ? parsed : parseFloat(parsed.value);
          if (!Number.isNaN(val)) {
            const arr = topicMap.get(msg.topic) ?? [];
            arr.push({ timestamp: new Date(msg.timestamp).getTime(), value: val });
            topicMap.set(msg.topic, arr);
          }
        } catch {
          // not numeric
        }
      } else {
        const arr = topicMap.get(msg.topic) ?? [];
        arr.push({ timestamp: new Date(msg.timestamp).getTime(), value: num });
        topicMap.set(msg.topic, arr);
      }
    }

    const result: NumericTopicData[] = [];
    for (const [topic, values] of topicMap) {
      if (values.length < 2) continue;
      const last100 = values.slice(-100);
      const nums = last100.map((v) => v.value);
      result.push({
        topic,
        values: last100,
        currentValue: nums[nums.length - 1],
        min: Math.min(...nums),
        max: Math.max(...nums),
        avg: nums.reduce((a, b) => a + b, 0) / nums.length,
        lastTimestamp: last100[last100.length - 1].timestamp,
      });
    }

    return result.sort((a, b) => b.values.length - a.values.length);
  }, [messages]);

  if (numericTopics.length === 0) {
    return (
      <div className="h-full flex items-center justify-center">
        <EmptyState
          icon={<LayoutDashboard size={32} />}
          title="No Numeric Data"
          description="Subscribe to topics with numeric payloads to see live charts"
          action={
            <Button variant="primary" size="sm" onClick={() => setActiveView("mqtt_explorer")}>
              <Activity size={12} />
              Manage Subscriptions
            </Button>
          }
        />
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-iot-border flex-shrink-0">
        <div className="flex items-center gap-2">
          <LayoutDashboard size={14} className="text-iot-cyan" />
          <span className="text-xs font-semibold text-iot-text-secondary uppercase tracking-wider">
            MQTT Dashboard
          </span>
          <Badge variant="info">{numericTopics.length} topics</Badge>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="default">{messages.length} msgs</Badge>
        </div>
      </div>

      {/* Grid */}
      <div className="flex-1 overflow-auto p-4">
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-4">
          {numericTopics.map((data) => {
            const isFresh = Date.now() - data.lastTimestamp < 10_000;
            return (
            <Card key={data.topic} className="flex flex-col overflow-hidden" glow={isFresh ? "cyan" : undefined}>
              <div className="px-3 pt-3 pb-2">
                <h4 className="text-xs font-semibold text-iot-text-primary truncate mb-1">
                  {data.topic}
                </h4>
                <div className="flex items-baseline gap-2">
                  <span className="text-xl font-mono font-bold text-iot-text-primary">
                    {smartFormat(data.currentValue)}
                  </span>
                  <span className="text-2xs text-iot-text-disabled ml-auto">
                    {data.values.length} pts
                  </span>
                </div>
              </div>

              <div className="px-1 pb-2 flex-1 min-w-0">
                <Sparkline data={data.values.map((v) => v.value)} height={80} />
              </div>

              <div className="flex items-center gap-3 px-3 py-1.5 text-2xs border-t border-iot-border/30">
                <div className="font-mono">
                  <span className="text-iot-text-disabled">Min </span>
                  <span className="text-iot-text-muted">{smartFormat(data.min)}</span>
                </div>
                <div className="font-mono">
                  <span className="text-iot-text-disabled">Max </span>
                  <span className="text-iot-text-muted">{smartFormat(data.max)}</span>
                </div>
                <div className="font-mono">
                  <span className="text-iot-text-disabled">Avg </span>
                  <span className="text-iot-text-muted">{smartFormat(data.avg)}</span>
                </div>
              </div>
            </Card>
            );
          })}
        </div>
      </div>
    </div>
  );
};
