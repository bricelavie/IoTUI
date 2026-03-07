/** Shared design token constants for use in SVG/canvas contexts where Tailwind classes are unavailable. */
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
