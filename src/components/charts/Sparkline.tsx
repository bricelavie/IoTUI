import React from "react";

interface SparklineProps {
  data: { timestamp: number; value: number }[];
  width?: number;
  height?: number;
  color?: string;
  strokeWidth?: number;
}

export const Sparkline: React.FC<SparklineProps> = ({
  data,
  width = 80,
  height = 24,
  color = "#00d4aa",
  strokeWidth = 1.5,
}) => {
  if (data.length < 2) return null;

  const values = data.map((d) => d.value);
  const min = Math.min(...values);
  const max = Math.max(...values);
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

  // Gradient fill path
  const firstPoint = points[0];
  const lastPoint = points[points.length - 1];
  const fillD = `${pathD} L${padding + innerWidth},${padding + innerHeight} L${padding},${padding + innerHeight} Z`;

  return (
    <svg width={width} height={height} className="flex-shrink-0">
      <defs>
        <linearGradient id={`spark-grad-${color.replace("#", "")}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.3" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path
        d={fillD}
        fill={`url(#spark-grad-${color.replace("#", "")})`}
      />
      <path
        d={pathD}
        fill="none"
        stroke={color}
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
          fill={color}
        />
      )}
    </svg>
  );
};
