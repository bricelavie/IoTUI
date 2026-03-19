import React, { useRef, useState, useEffect, memo } from "react";
import { getThemeColors } from "@/utils/theme";

interface DashboardSparklineProps {
  data: number[];
  height?: number;
  color?: string;
}

/** Responsive inline sparkline for dashboard cards. Uses ResizeObserver for width. */
export const DashboardSparkline: React.FC<DashboardSparklineProps> = memo(({
  data,
  height = 80,
  color,
}) => {
  const themeColors = getThemeColors();
  const resolvedColor = color ?? themeColors.cyan;
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
  let min = data[0];
  let max = data[0];
  for (let i = 1; i < data.length; i++) {
    if (data[i] < min) min = data[i];
    if (data[i] > max) max = data[i];
  }
  const range = max - min || 1;
  const step = width / (data.length - 1);

  const points = data
    .map((v, i) => `${i * step},${height - ((v - min) / range) * (height - 4) - 2}`)
    .join(" ");

  return (
    <div ref={containerRef} className="w-full" role="img" aria-label="Sparkline chart">
      <svg width={width} height={height} className="block">
        <polyline
          points={points}
          fill="none"
          stroke={resolvedColor}
          strokeWidth="1.5"
          strokeLinejoin="round"
          strokeLinecap="round"
        />
      </svg>
    </div>
  );
});
DashboardSparkline.displayName = "DashboardSparkline";
