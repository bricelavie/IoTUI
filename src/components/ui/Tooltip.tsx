import React, { useId, useState, useRef, useCallback, useEffect } from "react";
import { createPortal } from "react-dom";

export const Tooltip: React.FC<{
  content: string;
  children: React.ReactNode;
}> = ({ content, children }) => {
  const tooltipId = useId();
  const [visible, setVisible] = useState(false);
  const [coords, setCoords] = useState<{ top: number; left: number } | null>(null);
  const triggerRef = useRef<HTMLDivElement>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);

  const show = useCallback(() => setVisible(true), []);
  const hide = useCallback(() => setVisible(false), []);

  useEffect(() => {
    if (!visible || !triggerRef.current) {
      setCoords(null);
      return;
    }
    const rect = triggerRef.current.getBoundingClientRect();
    // Position above center by default
    let top = rect.top - 6; // 6px gap
    let left = rect.left + rect.width / 2;

    // After first render, adjust if tooltip overflows viewport
    requestAnimationFrame(() => {
      if (!tooltipRef.current) return;
      const tip = tooltipRef.current.getBoundingClientRect();

      let adjustedTop = top - tip.height;
      let adjustedLeft = left - tip.width / 2;

      // If tooltip goes above viewport, place below trigger instead
      if (adjustedTop < 4) {
        adjustedTop = rect.bottom + 6;
      }
      // Clamp horizontal to stay within viewport
      if (adjustedLeft < 4) adjustedLeft = 4;
      if (adjustedLeft + tip.width > window.innerWidth - 4) {
        adjustedLeft = window.innerWidth - tip.width - 4;
      }

      setCoords({ top: adjustedTop, left: adjustedLeft });
    });

    // Set initial position (will be refined in rAF)
    setCoords({ top: top - 24, left });
  }, [visible]);

  return (
    <>
      <div
        ref={triggerRef}
        onMouseEnter={show}
        onMouseLeave={hide}
        onFocus={show}
        onBlur={hide}
        aria-describedby={visible ? tooltipId : undefined}
        className="inline-flex"
      >
        {children}
      </div>
      {visible &&
        coords &&
        createPortal(
          <div
            ref={tooltipRef}
            id={tooltipId}
            role="tooltip"
            style={{
              position: "fixed",
              top: coords.top,
              left: coords.left,
              zIndex: 99999,
            }}
            className="px-2 py-1 bg-iot-bg-elevated border border-iot-border rounded text-2xs text-iot-text-secondary whitespace-nowrap pointer-events-none animate-in fade-in duration-100"
          >
            {content}
          </div>,
          document.body
        )}
    </>
  );
};
