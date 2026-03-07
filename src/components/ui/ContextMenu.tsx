import React, { useEffect, useLayoutEffect, useRef, useState, useCallback } from "react";
import { clsx } from "clsx";

export interface ContextMenuItem {
  id: string;
  label: string;
  icon?: React.ReactNode;
  shortcut?: string;
  danger?: boolean;
  disabled?: boolean;
  separator?: boolean;
}

interface ContextMenuProps {
  items: ContextMenuItem[];
  position: { x: number; y: number } | null;
  onSelect: (id: string) => void;
  onClose: () => void;
}

export const ContextMenu: React.FC<ContextMenuProps> = ({
  items,
  position,
  onSelect,
  onClose,
}) => {
  const menuRef = useRef<HTMLDivElement>(null);
  const [adjusted, setAdjusted] = useState<{ x: number; y: number } | null>(null);

  // Adjust position to keep menu within viewport (useLayoutEffect prevents visual flash)
  useLayoutEffect(() => {
    if (!position || !menuRef.current) {
      setAdjusted(null);
      return;
    }
    const rect = menuRef.current.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    let x = position.x;
    let y = position.y;
    if (x + rect.width > vw) x = vw - rect.width - 8;
    if (y + rect.height > vh) y = vh - rect.height - 8;
    if (x < 4) x = 4;
    if (y < 4) y = 4;
    setAdjusted({ x, y });
  }, [position]);

  // Close on outside click or escape
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    },
    [onClose]
  );

  useEffect(() => {
    if (!position) return;
    const handleClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    document.addEventListener("mousedown", handleClick);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handleClick);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [position, onClose, handleKeyDown]);

  if (!position) return null;

  const pos = adjusted || position;

  return (
    <div
      ref={menuRef}
      className="context-menu fixed z-[9500] min-w-[180px] py-1 rounded-lg border border-iot-border bg-iot-bg-surface/95 backdrop-blur-sm shadow-xl shadow-black/40"
      style={{ left: pos.x, top: pos.y }}
    >
      {items.map((item) => {
        if (item.separator) {
          return (
            <div
              key={item.id}
              className="my-1 border-t border-iot-border"
            />
          );
        }
        return (
          <button
            key={item.id}
            disabled={item.disabled}
            className={clsx(
              "flex items-center gap-2.5 w-full px-3 py-1.5 text-xs transition-colors duration-75",
              item.disabled
                ? "text-iot-text-disabled cursor-not-allowed"
                : item.danger
                ? "text-iot-red hover:bg-iot-red/10"
                : "text-iot-text-secondary hover:bg-iot-bg-hover hover:text-iot-text-primary"
            )}
            onClick={() => {
              if (!item.disabled) {
                onSelect(item.id);
                onClose();
              }
            }}
          >
            {item.icon && (
              <span className="flex-shrink-0 w-4 h-4 flex items-center justify-center">
                {item.icon}
              </span>
            )}
            <span className="flex-1 text-left">{item.label}</span>
            {item.shortcut && (
              <span className="text-2xs text-iot-text-disabled font-mono ml-4">
                {item.shortcut}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
};

// ─── Hook for managing context menu state ──────────────────────────

export function useContextMenu<T = unknown>() {
  const [menuPosition, setMenuPosition] = useState<{ x: number; y: number } | null>(null);
  const [menuData, setMenuData] = useState<T | null>(null);

  const showMenu = useCallback((e: React.MouseEvent, data?: T) => {
    e.preventDefault();
    e.stopPropagation();
    setMenuPosition({ x: e.clientX, y: e.clientY });
    setMenuData(data ?? null);
  }, []);

  const closeMenu = useCallback(() => {
    setMenuPosition(null);
    setMenuData(null);
  }, []);

  return { menuPosition, menuData, showMenu, closeMenu };
}
