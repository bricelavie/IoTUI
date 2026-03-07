import { useState, useEffect, RefObject } from "react";

/**
 * Tracks the pixel width of a DOM element via ResizeObserver.
 *
 * @param ref     - A ref attached to the element to observe.
 * @param initial - Initial width to use before the first measurement.
 * @returns The current measured width in pixels.
 */
export function useContainerWidth(
  ref: RefObject<HTMLElement | null>,
  initial = 0
): number {
  const [width, setWidth] = useState(initial);

  useEffect(() => {
    if (!ref.current) return;
    const obs = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setWidth(Math.floor(entry.contentRect.width));
      }
    });
    obs.observe(ref.current);
    return () => obs.disconnect();
  }, [ref]);

  return width;
}
