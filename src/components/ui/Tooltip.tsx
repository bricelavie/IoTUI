import React, { useId } from "react";

export const Tooltip: React.FC<{
  content: string;
  children: React.ReactNode;
}> = ({ content, children }) => {
  const tooltipId = useId();
  return (
    <div className="relative group">
      <div aria-describedby={tooltipId}>{children}</div>
      <div
        id={tooltipId}
        role="tooltip"
        className="absolute z-[100] bottom-full left-1/2 -translate-x-1/2 mb-1.5 px-2 py-1 bg-iot-bg-elevated border border-iot-border rounded text-2xs text-iot-text-secondary whitespace-nowrap opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 transition-opacity pointer-events-none"
      >
        {content}
      </div>
    </div>
  );
};
