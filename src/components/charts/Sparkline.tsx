import React, { useId, memo } from "react";
import { getThemeColors } from "@/utils/theme";

interface SparklineProps {
  data: { timestamp: number; value: number }[];
  width?: number;
  height?: number;
  color?: string;
  strokeWidth?: number;
}

export const Sparkline: React.FC<SparklineProps> = memo(({
  data,
  width = 80,
  height = 24,
  color,
  strokeWidth = 1.5,
}) => {
  const theme = getThemeColors();
  const resolvedColor = color ?? theme.cyan;
  const uid = useId();
  const gradientId = `spark-grad-${uid.replace(/:/g, "")}`;

  if (data.length < 2) return null;

  const values = data.map((d) => d.value);
  let min = values[0];
  let max = values[0];
  for (const v of values) {
    if (v < min) min = v;
    if (v > max) max = v;
  }
  const range = max - min || 1;

  const padding = 1;
  const innerWidth = width - padding * 2;
  const innerHeight = height - padding * 2;

  const points = data.map((d, i) => {
    const x = padding + (i / (data.length - 1)) * innerWidth;
    const y = padding + innerHeight - ((d.value - min) / range) * innerHeight;
    return `${x},${y}`;
  });

  const pathD = `M${points.join(" L")}`;
  const fillD = `${pathD} L${padding + innerWidth},${padding + innerHeight} L${padding},${padding + innerHeight} Z`;

  return (
    <svg width={width} height={height} className="flex-shrink-0">
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={resolvedColor} stopOpacity="0.3" />
          <stop offset="100%" stopColor={resolvedColor} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path
        d={fillD}
        fill={`url(#${gradientId})`}
      />
      <path
        d={pathD}
        fill="none"
        stroke={resolvedColor}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {/* Current value dot */}
      {data.length > 0 && (
        <circle
          cx={padding + innerWidth}
          cy={padding + innerHeight - ((values[values.length - 1] - min) / range) * innerHeight}
          r={2}
          fill={resolvedColor}
        />
      )}
    </svg>
  );
});
Sparkline.displayName = "Sparkline";
