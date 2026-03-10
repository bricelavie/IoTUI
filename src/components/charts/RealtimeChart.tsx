import React, { useMemo, useState, useCallback, useRef, useId, memo } from "react";
import { Clock } from "lucide-react";
import { getThemeColors } from "@/utils/theme";

interface DataPoint {
  timestamp: number;
  value: number;
}

interface RealtimeChartProps {
  data: DataPoint[];
  width?: number;
  height?: number;
  color?: string;
  showGrid?: boolean;
  showAxis?: boolean;
  label?: string;
  /** Show time range controls toolbar */
  showControls?: boolean;
}

type TimeRange = "30s" | "1m" | "5m" | "all";

const TIME_RANGES: { key: TimeRange; label: string; ms: number | null }[] = [
  { key: "30s", label: "30s", ms: 30_000 },
  { key: "1m", label: "1m", ms: 60_000 },
  { key: "5m", label: "5m", ms: 300_000 },
  { key: "all", label: "All", ms: null },
];

interface ChartPoint {
  x: number;
  y: number;
  value: number;
  timestamp: number;
}

export const RealtimeChart: React.FC<RealtimeChartProps> = memo(({
  data,
  width = 300,
  height = 120,
  color,
  showGrid = true,
  showAxis = true,
  label,
  showControls = false,
}) => {
  const theme = getThemeColors();
  const resolvedColor = color ?? theme.cyan;

  // ─── Trend control state ────────────────────────────────────────
  const uid = useId();
  const gradientId = `chart-grad-${uid.replace(/:/g, "")}`;
  const [timeRange, setTimeRange] = useState<TimeRange>("all");
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);

  // Filter by time range
  const filteredData = useMemo(() => {
    const range = TIME_RANGES.find((r) => r.key === timeRange);
    if (!range || !range.ms) return data;
    const cutoff = Date.now() - range.ms;
    return data.filter((d) => d.timestamp >= cutoff);
  }, [data, timeRange]);

  // ─── Geometry ───────────────────────────────────────────────────
  const pad = {
    top: 10,
    right: 14,
    bottom: showAxis ? 22 : 8,
    left: showAxis ? 50 : 8,
  };
  const innerW = width - pad.left - pad.right;
  const innerH = height - pad.top - pad.bottom;

  const { points, fillPath, linePath, yTicks } = useMemo(() => {
    if (filteredData.length < 2)
      return {
        points: [] as ChartPoint[],
        fillPath: "",
        linePath: "",
        yTicks: [] as { value: number; y: number }[],
      };

    const values = filteredData.map((d) => d.value);
    let rawMin = values[0];
    let rawMax = values[0];
    for (const v of values) {
      if (v < rawMin) rawMin = v;
      if (v > rawMax) rawMax = v;
    }

    let lo: number, hi: number;
    {
      const r = rawMax - rawMin || 1;
      lo = rawMin - r * 0.05;
      hi = rawMax + r * 0.05;
    }

    const span = hi - lo;

    const pts: ChartPoint[] = filteredData.map((d, i) => ({
      x: pad.left + (i / (filteredData.length - 1)) * innerW,
      y: pad.top + innerH - ((d.value - lo) / span) * innerH,
      value: d.value,
      timestamp: d.timestamp,
    }));

    const lineD = `M${pts.map((p) => `${p.x},${p.y}`).join(" L")}`;
    const fillD = `${lineD} L${pts[pts.length - 1].x},${pad.top + innerH} L${pts[0].x},${pad.top + innerH} Z`;

    const tickCount = 5;
    const yTicks = Array.from({ length: tickCount }, (_, i) => {
      const val = lo + (span * i) / (tickCount - 1);
      const y = pad.top + innerH - (i / (tickCount - 1)) * innerH;
      return { value: val, y };
    });

    return { points: pts, fillPath: fillD, linePath: lineD, yTicks };
  }, [filteredData, width, height, showAxis]);

  // ─── Crosshair mouse handling ───────────────────────────────────
  const handleMouseMove = useCallback(
    (e: React.MouseEvent<SVGSVGElement>) => {
      if (!svgRef.current || points.length === 0) {
        setHoverIndex(null);
        return;
      }
      const rect = svgRef.current.getBoundingClientRect();
      const mouseX = e.clientX - rect.left;

      let closestIdx = 0;
      let closestDist = Infinity;
      for (let i = 0; i < points.length; i++) {
        const dist = Math.abs(points[i].x - mouseX);
        if (dist < closestDist) {
          closestDist = dist;
          closestIdx = i;
        }
      }
      setHoverIndex(closestDist < 40 ? closestIdx : null);
    },
    [points]
  );

  const handleMouseLeave = useCallback(() => setHoverIndex(null), []);

  // ─── Tooltip positioning ────────────────────────────────────────
  const tooltip = useMemo(() => {
    if (hoverIndex === null || !points[hoverIndex]) return null;
    const pt = points[hoverIndex];
    const tw = 135;
    const th = 36;
    const tx = pt.x + tw + 16 > width ? pt.x - tw - 10 : pt.x + 12;
    const ty = pt.y - th - 10 < pad.top ? pt.y + 12 : pt.y - th - 6;
    return { x: tx, y: ty, w: tw, h: th, pt };
  }, [hoverIndex, points, width]);

  // ─── Empty state (no controls) ─────────────────────────────────
  if (filteredData.length < 2 && !showControls) {
    return (
      <div
        style={{ width, height }}
        className="flex items-center justify-center text-2xs text-iot-text-disabled"
      >
        Waiting for data...
      </div>
    );
  }

  return (
    <div className="flex flex-col">
      {/* ─── Controls + Label row ─── */}
      {showControls && (
        <div className="flex items-center mb-1.5">
          {/* Label on the left */}
          {label && (
            <span className="text-2xs text-iot-text-muted font-medium truncate mr-auto">
              {label}
            </span>
          )}
          {/* Time range selector — centered when no label, right-aligned when label present */}
          <div className={`flex items-center bg-iot-bg-elevated rounded border border-iot-border overflow-hidden ${!label ? "mx-auto" : ""}`}>
            <span className="px-1.5 flex items-center">
              <Clock size={10} className="text-iot-text-disabled" />
            </span>
            {TIME_RANGES.map((r) => (
              <button
                key={r.key}
                onClick={() => setTimeRange(r.key)}
                className={`px-2 py-1 text-2xs font-mono transition-colors ${
                  timeRange === r.key
                    ? "text-iot-cyan bg-iot-cyan/10 font-semibold"
                    : "text-iot-text-muted hover:text-iot-text-secondary hover:bg-iot-bg-hover"
                }`}
              >
                {r.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Label when no controls */}
      {!showControls && label && (
        <span className="text-2xs text-iot-text-muted mb-1 block font-medium truncate">{label}</span>
      )}

      {/* ─── Chart SVG ─── */}
      {filteredData.length < 2 ? (
        <div
          style={{ width, height }}
          className="flex items-center justify-center text-2xs text-iot-text-disabled border border-iot-border/20 rounded"
        >
          Waiting for data...
        </div>
      ) : (
        <svg
          ref={svgRef}
          width={width}
          height={height}
          className="overflow-visible select-none"
          onMouseMove={showControls ? handleMouseMove : undefined}
          onMouseLeave={showControls ? handleMouseLeave : undefined}
        >
          <defs>
            <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={resolvedColor} stopOpacity="0.15" />
              <stop offset="100%" stopColor={resolvedColor} stopOpacity="0" />
            </linearGradient>
          </defs>

          {/* Grid lines */}
          {showGrid &&
            yTicks.map((tick, i) => (
              <line
                key={i}
                x1={pad.left}
                y1={tick.y}
                x2={pad.left + innerW}
                y2={tick.y}
                stroke={theme.border.DEFAULT}
                strokeWidth={0.5}
              />
            ))}

          {/* Fill area under curve */}
          <path d={fillPath} fill={`url(#${gradientId})`} />

          {/* Data line */}
          <path
            d={linePath}
            fill="none"
            stroke={resolvedColor}
            strokeWidth={1.5}
            strokeLinecap="round"
            strokeLinejoin="round"
          />

          {/* Live head dot */}
          {points.length > 0 && (
            <>
              <circle
                cx={points[points.length - 1].x}
                cy={points[points.length - 1].y}
                r={3}
                fill={resolvedColor}
                style={{ filter: `drop-shadow(0 0 4px ${resolvedColor})` }}
              />
              <circle
                cx={points[points.length - 1].x}
                cy={points[points.length - 1].y}
                r={7}
                fill={resolvedColor}
                opacity={0.15}
              />
            </>
          )}

          {/* ─── Crosshair overlay ─── */}
          {tooltip && (
            <>
              {/* Vertical crosshair line */}
              <line
                x1={tooltip.pt.x}
                y1={pad.top}
                x2={tooltip.pt.x}
                y2={pad.top + innerH}
                stroke={theme.text.disabled}
                strokeWidth={1}
                strokeDasharray="4,3"
              />
              {/* Horizontal crosshair line */}
              <line
                x1={pad.left}
                y1={tooltip.pt.y}
                x2={pad.left + innerW}
                y2={tooltip.pt.y}
                stroke={theme.border.light}
                strokeWidth={1}
                strokeDasharray="4,3"
              />
              {/* Crosshair dot */}
              <circle
                cx={tooltip.pt.x}
                cy={tooltip.pt.y}
                r={5}
                fill={resolvedColor}
                stroke={theme.text.primary}
                strokeWidth={2}
                style={{ filter: `drop-shadow(0 0 6px ${resolvedColor})` }}
              />
              {/* Tooltip background */}
              <rect
                x={tooltip.x}
                y={tooltip.y}
                width={tooltip.w}
                height={tooltip.h}
                rx={4}
                fill={theme.bg.base}
                stroke={theme.border.light}
                strokeWidth={1}
              />
              {/* Tooltip value */}
              <text
                x={tooltip.x + 8}
                y={tooltip.y + 14}
                fill={theme.text.primary}
                fontSize={11}
                fontFamily="JetBrains Mono, monospace"
                fontWeight="600"
              >
                {tooltip.pt.value.toFixed(3)}
              </text>
              {/* Tooltip timestamp */}
              <text
                x={tooltip.x + 8}
                y={tooltip.y + 28}
                fill={theme.text.muted}
                fontSize={9}
                fontFamily="JetBrains Mono, monospace"
              >
                {new Date(tooltip.pt.timestamp).toLocaleTimeString()}
              </text>
            </>
          )}

          {/* Y-axis labels */}
          {showAxis &&
            yTicks.map((tick, i) => (
              <text
                key={i}
                x={pad.left - 6}
                y={tick.y + 3}
                textAnchor="end"
                fill={theme.text.disabled}
                fontSize={9}
                fontFamily="JetBrains Mono, monospace"
              >
                {tick.value.toFixed(1)}
              </text>
            ))}

        </svg>
      )}
    </div>
  );
});
RealtimeChart.displayName = "RealtimeChart";
