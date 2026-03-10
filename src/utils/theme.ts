/**
 * Shared design-token accessor for SVG / canvas contexts where
 * Tailwind classes are unavailable.
 *
 * Reads from the active theme palette exposed by the theme store,
 * so colours always match the user's selected theme.
 */

import { getActiveThemePalette } from "@/stores/themeStore";

/** Convert an RGB triplet string ("8 11 18") to a hex string ("#080b12"). */
function tripletToHex(triplet: string): string {
  const parts = triplet.split(" ").map(Number);
  return (
    "#" +
    parts
      .map((n) => n.toString(16).padStart(2, "0"))
      .join("")
  );
}

/** Resolve the current theme palette into hex colours for imperative use. */
export function getThemeColors() {
  const p = getActiveThemePalette();
  return {
    bg: {
      base: tripletToHex(p.bg.base),
      surface: tripletToHex(p.bg.surface),
      elevated: tripletToHex(p.bg.elevated),
      hover: tripletToHex(p.bg.hover),
    },
    border: {
      DEFAULT: tripletToHex(p.border.default),
      light: tripletToHex(p.border.light),
    },
    text: {
      primary: tripletToHex(p.text.primary),
      secondary: tripletToHex(p.text.secondary),
      muted: tripletToHex(p.text.muted),
      disabled: tripletToHex(p.text.disabled),
    },
    cyan: tripletToHex(p.accent.cyan),
    amber: tripletToHex(p.accent.amber),
    red: tripletToHex(p.accent.red),
    blue: tripletToHex(p.accent.blue),
    purple: tripletToHex(p.accent.purple),
    green: tripletToHex(p.accent.green),
  } as const;
}

/**
 * @deprecated Use `getThemeColors()` instead for dynamic values.
 * Kept for backward-compatibility: returns the static IoT-1 palette.
 */
export const theme = {
  bg: {
    base: "#080b12",
    surface: "#0f1420",
    elevated: "#161c2a",
    hover: "#1c2333",
  },
  border: {
    DEFAULT: "#1e2a3a",
    light: "#2a3650",
  },
  text: {
    primary: "#f0f4f8",
    secondary: "#94a3b8",
    muted: "#64748b",
    disabled: "#475569",
  },
  cyan: "#00d4aa",
  amber: "#f59e0b",
  red: "#ef4444",
  blue: "#3b82f6",
  purple: "#a855f7",
} as const;
