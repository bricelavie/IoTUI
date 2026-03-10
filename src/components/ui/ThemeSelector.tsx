import React, { useState, useRef, useEffect, useCallback } from "react";
import { clsx } from "clsx";
import { Check, ChevronsUpDown } from "lucide-react";
import { useThemeStore } from "@/stores/themeStore";
import { themes, type ThemePalette } from "@/themes/index";

// ─── Tiny swatch that previews a theme's key colours ─────────────

const ThemeSwatch: React.FC<{ palette: ThemePalette; size?: number }> = ({
  palette,
  size = 14,
}) => {
  const r = size / 2;
  const tripletToHex = (t: string) =>
    "#" +
    t
      .split(" ")
      .map((n) => Number(n).toString(16).padStart(2, "0"))
      .join("");

  return (
    <svg width={size} height={size} className="flex-shrink-0 rounded-sm overflow-hidden">
      {/* Background quad */}
      <rect width={r} height={r} fill={tripletToHex(palette.bg.base)} />
      <rect x={r} width={r} height={r} fill={tripletToHex(palette.bg.surface)} />
      {/* Accent quad */}
      <rect y={r} width={r} height={r} fill={tripletToHex(palette.accent.cyan)} />
      <rect x={r} y={r} width={r} height={r} fill={tripletToHex(palette.accent.purple)} />
    </svg>
  );
};

// ─── Main ThemeSelector component ────────────────────────────────

export const ThemeSelector: React.FC = () => {
  const { themeId, setTheme, previewTheme, revertPreview, palette } =
    useThemeStore();
  const [open, setOpen] = useState(false);
  const [focusedIndex, setFocusedIndex] = useState(-1);
  const containerRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const itemRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const previewIdRef = useRef<string | null>(null);

  const activeTheme = themes.find((t) => t.id === themeId) ?? themes[0];
  const activeIndex = themes.findIndex((t) => t.id === themeId);

  // ── Preview helpers ──────────────────────────────────────────────

  const applyPreview = useCallback(
    (id: string) => {
      if (id !== themeId && id !== previewIdRef.current) {
        previewIdRef.current = id;
        previewTheme(id);
      }
    },
    [themeId, previewTheme],
  );

  const clearPreview = useCallback(() => {
    if (previewIdRef.current !== null) {
      previewIdRef.current = null;
      revertPreview();
    }
  }, [revertPreview]);

  // ── Open / close management ────────────────────────────────────

  const openDropdown = useCallback(() => {
    setOpen(true);
    setFocusedIndex(activeIndex >= 0 ? activeIndex : 0);
  }, [activeIndex]);

  const closeDropdown = useCallback(
    (restoreFocus = true) => {
      clearPreview();
      setOpen(false);
      setFocusedIndex(-1);
      if (restoreFocus) {
        triggerRef.current?.focus();
      }
    },
    [clearPreview],
  );

  const handleSelect = useCallback(
    (id: string) => {
      previewIdRef.current = null; // skip revert — we're committing
      setTheme(id);
      setOpen(false);
      setFocusedIndex(-1);
      triggerRef.current?.focus();
    },
    [setTheme],
  );

  // ── Close on outside click ─────────────────────────────────────

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node)
      ) {
        closeDropdown(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open, closeDropdown]);

  // ── Scroll focused item into view ──────────────────────────────

  useEffect(() => {
    if (open && focusedIndex >= 0) {
      itemRefs.current[focusedIndex]?.scrollIntoView({ block: "nearest" });
    }
  }, [open, focusedIndex]);

  // ── Scroll active theme into view on first open ────────────────

  useEffect(() => {
    if (open && listRef.current) {
      const activeEl = listRef.current.querySelector("[data-active='true']");
      if (activeEl) {
        activeEl.scrollIntoView({ block: "nearest" });
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // ── Live preview from focused index (keyboard) ─────────────────

  useEffect(() => {
    if (!open) return;
    if (focusedIndex >= 0 && focusedIndex < themes.length) {
      applyPreview(themes[focusedIndex].id);
    }
  }, [open, focusedIndex, applyPreview]);

  // ── Keyboard handling ──────────────────────────────────────────

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (!open) {
        // Trigger button keys
        if (
          e.key === "ArrowDown" ||
          e.key === "ArrowUp" ||
          e.key === "Enter" ||
          e.key === " "
        ) {
          e.preventDefault();
          openDropdown();
        }
        return;
      }

      switch (e.key) {
        case "ArrowDown":
          e.preventDefault();
          setFocusedIndex((prev) =>
            prev < themes.length - 1 ? prev + 1 : prev,
          );
          break;
        case "ArrowUp":
          e.preventDefault();
          setFocusedIndex((prev) => (prev > 0 ? prev - 1 : prev));
          break;
        case "Home":
          e.preventDefault();
          setFocusedIndex(0);
          break;
        case "End":
          e.preventDefault();
          setFocusedIndex(themes.length - 1);
          break;
        case "Enter":
        case " ":
          e.preventDefault();
          if (focusedIndex >= 0 && focusedIndex < themes.length) {
            handleSelect(themes[focusedIndex].id);
          }
          break;
        case "Escape":
          e.preventDefault();
          closeDropdown();
          break;
        case "Tab":
          // Close without preventing default so focus moves naturally
          closeDropdown(false);
          break;
      }
    },
    [open, focusedIndex, openDropdown, closeDropdown, handleSelect],
  );

  // ── Mouse handlers for live preview ────────────────────────────

  const handleMouseEnter = useCallback(
    (index: number) => {
      setFocusedIndex(index);
      applyPreview(themes[index].id);
    },
    [applyPreview],
  );

  const handleMouseLeave = useCallback(() => {
    clearPreview();
    // Reset focused index back to active theme
    setFocusedIndex(activeIndex >= 0 ? activeIndex : 0);
  }, [clearPreview, activeIndex]);

  // ── Render ─────────────────────────────────────────────────────

  const listboxId = "theme-selector-listbox";

  return (
    <div
      ref={containerRef}
      className="relative w-full max-w-xs"
      onKeyDown={handleKeyDown}
    >
      {/* Trigger button */}
      <button
        ref={triggerRef}
        onClick={() => (open ? closeDropdown() : openDropdown())}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listboxId : undefined}
        aria-activedescendant={
          open && focusedIndex >= 0
            ? `theme-option-${themes[focusedIndex].id}`
            : undefined
        }
        className={clsx(
          "w-full flex items-center gap-2.5 px-3 py-2 rounded-lg border transition-all duration-150",
          "bg-iot-bg-base text-iot-text-primary text-sm font-medium",
          open
            ? "border-iot-border-focus ring-2 ring-iot-border-focus/20"
            : "border-iot-border hover:border-iot-border-light",
        )}
      >
        <ThemeSwatch palette={palette} size={16} />
        <span className="flex-1 text-left truncate">{activeTheme.name}</span>
        <ChevronsUpDown
          size={14}
          className="text-iot-text-muted flex-shrink-0"
        />
      </button>

      {/* Dropdown */}
      {open && (
        <div
          className={clsx(
            "absolute z-50 mt-1.5 w-full rounded-lg border border-iot-border bg-iot-bg-surface",
            "shadow-lg shadow-black/30 overflow-hidden animate-fade-in",
          )}
        >
          <div
            ref={listRef}
            id={listboxId}
            role="listbox"
            aria-label="Select theme"
            className="max-h-64 overflow-auto py-1"
            onMouseLeave={handleMouseLeave}
          >
            {themes.map((t, index) => {
              const isActive = t.id === themeId;
              const isFocused = index === focusedIndex;
              return (
                <button
                  key={t.id}
                  ref={(el) => {
                    itemRefs.current[index] = el;
                  }}
                  id={`theme-option-${t.id}`}
                  role="option"
                  aria-selected={isActive}
                  data-active={isActive}
                  data-focused={isFocused}
                  onClick={() => handleSelect(t.id)}
                  onMouseEnter={() => handleMouseEnter(index)}
                  className={clsx(
                    "w-full flex items-center gap-2.5 px-3 py-2 text-sm transition-colors duration-100",
                    isActive && !isFocused &&
                      "bg-iot-cyan/10 text-iot-text-primary font-medium",
                    isActive && isFocused &&
                      "bg-iot-cyan/15 text-iot-text-primary font-medium",
                    !isActive && isFocused &&
                      "bg-iot-bg-hover text-iot-text-primary",
                    !isActive && !isFocused &&
                      "text-iot-text-secondary hover:bg-iot-bg-hover hover:text-iot-text-primary",
                  )}
                >
                  <ThemeSwatch palette={t} size={14} />
                  <span className="flex-1 text-left truncate">{t.name}</span>
                  {isActive && (
                    <Check
                      size={14}
                      className="text-iot-cyan flex-shrink-0"
                    />
                  )}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};
