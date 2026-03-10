import type { Config } from "tailwindcss";

/**
 * Helper: reference a CSS custom-property that holds an RGB triplet.
 * Tailwind's `<alpha-value>` placeholder lets opacity modifiers like
 * `bg-iot-bg-base/50` still work:
 *
 *   rgb(var(--iot-bg-base) / <alpha-value>)
 */
function rgb(varName: string) {
  return `rgb(var(${varName}) / <alpha-value>)`;
}

const config: Config = {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        // Core backgrounds
        "iot-bg": {
          base: rgb("--iot-bg-base"),
          surface: rgb("--iot-bg-surface"),
          elevated: rgb("--iot-bg-elevated"),
          hover: rgb("--iot-bg-hover"),
        },
        // Borders
        "iot-border": {
          DEFAULT: rgb("--iot-border"),
          light: rgb("--iot-border-light"),
          focus: rgb("--iot-border-focus"),
        },
        // Accent colors
        "iot-cyan": {
          DEFAULT: rgb("--iot-cyan"),
          dim: rgb("--iot-cyan"),      // consumers apply /12 opacity via class
          muted: rgb("--iot-cyan"),    // consumers apply /38 opacity via class
        },
        "iot-amber": {
          DEFAULT: rgb("--iot-amber"),
          dim: rgb("--iot-amber"),
          muted: rgb("--iot-amber"),
        },
        "iot-red": {
          DEFAULT: rgb("--iot-red"),
          dim: rgb("--iot-red"),
          muted: rgb("--iot-red"),
        },
        "iot-blue": {
          DEFAULT: rgb("--iot-blue"),
          dim: rgb("--iot-blue"),
          muted: rgb("--iot-blue"),
        },
        "iot-purple": {
          DEFAULT: rgb("--iot-purple"),
          dim: rgb("--iot-purple"),
        },
        "iot-green": {
          DEFAULT: rgb("--iot-green"),
          dim: rgb("--iot-green"),
          muted: rgb("--iot-green"),
        },
        // Text
        "iot-text": {
          primary: rgb("--iot-text-primary"),
          secondary: rgb("--iot-text-secondary"),
          muted: rgb("--iot-text-muted"),
          disabled: rgb("--iot-text-disabled"),
        },
      },
      fontFamily: {
        sans: ["Inter", "system-ui", "sans-serif"],
        mono: ["JetBrains Mono", "Fira Code", "monospace"],
      },
      fontSize: {
        "2xs": ["0.625rem", { lineHeight: "0.875rem" }],
      },
      boxShadow: {
        "iot-glow-cyan":
          "0 0 20px rgb(var(--iot-cyan) / 0.15)",
        "iot-glow-amber":
          "0 0 20px rgb(var(--iot-amber) / 0.15)",
        "iot-glow-red":
          "0 0 20px rgb(var(--iot-red) / 0.15)",
        "iot-glow-blue":
          "0 0 20px rgb(var(--iot-blue) / 0.15)",
        "iot-card":
          "0 1px 3px rgba(0, 0, 0, 0.3), 0 1px 2px rgba(0, 0, 0, 0.2)",
        "iot-card-hover":
          "0 4px 12px rgba(0, 0, 0, 0.4), 0 2px 4px rgba(0, 0, 0, 0.3)",
      },
      animation: {
        "pulse-slow": "pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite",
        "status-blink": "statusBlink 2s ease-in-out infinite",
        "fade-in": "fadeIn 0.2s ease-out",
        "slide-in": "slideIn 0.2s ease-out",
      },
      keyframes: {
        statusBlink: {
          "0%, 100%": { opacity: "1" },
          "50%": { opacity: "0.4" },
        },
        fadeIn: {
          "0%": { opacity: "0" },
          "100%": { opacity: "1" },
        },
        slideIn: {
          "0%": { opacity: "0", transform: "translateY(-4px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
      },
      backgroundImage: {
        "grid-pattern":
          "linear-gradient(rgb(var(--iot-grid) / 0.3) 1px, transparent 1px), linear-gradient(90deg, rgb(var(--iot-grid) / 0.3) 1px, transparent 1px)",
        "gradient-radial": "radial-gradient(var(--tw-gradient-stops))",
      },
    },
  },
  plugins: [],
};

export default config;
