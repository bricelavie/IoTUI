import React from "react";

interface GaugeProps {
  value: number;
  min?: number;
  max?: number;
  label?: string;
  unit?: string;
  size?: number;
  warningThreshold?: number;
  dangerThreshold?: number;
}

export const Gauge: React.FC<GaugeProps> = ({
  value,
  min = 0,
  max = 100,
  label,
  unit,
  size = 120,
  warningThreshold = 70,
  dangerThreshold = 90,
}) => {
  const range = max - min;
  const percentage = Math.min(Math.max((value - min) / range, 0), 1);
  const angle = percentage * 240 - 120; // -120 to 120 degrees

  const radius = size / 2 - 10;
  const cx = size / 2;
  const cy = size / 2;

  const color =
    value >= dangerThreshold
      ? "#ef4444"
      : value >= warningThreshold
      ? "#f59e0b"
      : "#00d4aa";

  // Arc path
  const startAngle = -120;
  const endAngle = angle;
  const startRad = (startAngle * Math.PI) / 180;
  const endRad = (endAngle * Math.PI) / 180;

  const bgEndRad = (120 * Math.PI) / 180;

  const arcPath = (start: number, end: number, r: number) => {
    const x1 = cx + r * Math.cos(start - Math.PI / 2);
    const y1 = cy + r * Math.sin(start - Math.PI / 2);
    const x2 = cx + r * Math.cos(end - Math.PI / 2);
    const y2 = cy + r * Math.sin(end - Math.PI / 2);
    const largeArc = end - start > Math.PI ? 1 : 0;
    return `M ${x1} ${y1} A ${r} ${r} 0 ${largeArc} 1 ${x2} ${y2}`;
  };

  return (
    <div className="flex flex-col items-center">
      <svg width={size} height={size * 0.75} viewBox={`0 0 ${size} ${size * 0.75}`}>
        {/* Background arc */}
        <path
          d={arcPath(startRad, bgEndRad, radius)}
          fill="none"
          stroke="#1e2a3a"
          strokeWidth={6}
          strokeLinecap="round"
        />
        {/* Value arc */}
        {percentage > 0 && (
          <path
            d={arcPath(startRad, endRad, radius)}
            fill="none"
            stroke={color}
            strokeWidth={6}
            strokeLinecap="round"
            style={{
              filter: `drop-shadow(0 0 4px ${color}40)`,
            }}
          />
        )}
        {/* Value text */}
        <text
          x={cx}
          y={cy - 2}
          textAnchor="middle"
          className="font-mono font-semibold"
          fill="#f0f4f8"
          fontSize={size * 0.18}
        >
          {typeof value === "number" ? value.toFixed(1) : value}
        </text>
        {unit && (
          <text
            x={cx}
            y={cy + size * 0.12}
            textAnchor="middle"
            fill="#64748b"
            fontSize={size * 0.09}
          >
            {unit}
          </text>
        )}
      </svg>
      {label && (
        <span className="text-2xs text-iot-text-muted mt-0.5">{label}</span>
      )}
    </div>
  );
};
