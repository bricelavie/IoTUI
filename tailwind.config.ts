import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        // Core backgrounds
        "iot-bg": {
          base: "#080b12",
          surface: "#0f1420",
          elevated: "#161c2a",
          hover: "#1c2333",
        },
        // Borders
        "iot-border": {
          DEFAULT: "#1e2a3a",
          light: "#2a3650",
          focus: "#3b82f6",
        },
        // Accent colors
        "iot-cyan": {
          DEFAULT: "#00d4aa",
          dim: "#00d4aa20",
          muted: "#00d4aa60",
        },
        "iot-amber": {
          DEFAULT: "#f59e0b",
          dim: "#f59e0b20",
          muted: "#f59e0b60",
        },
        "iot-red": {
          DEFAULT: "#ef4444",
          dim: "#ef444420",
          muted: "#ef444460",
        },
        "iot-blue": {
          DEFAULT: "#3b82f6",
          dim: "#3b82f620",
          muted: "#3b82f660",
        },
        "iot-purple": {
          DEFAULT: "#a855f7",
          dim: "#a855f720",
        },
        // Text
        "iot-text": {
          primary: "#f0f4f8",
          secondary: "#94a3b8",
          muted: "#64748b",
          disabled: "#475569",
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
        "iot-glow-cyan": "0 0 20px rgba(0, 212, 170, 0.15)",
        "iot-glow-amber": "0 0 20px rgba(245, 158, 11, 0.15)",
        "iot-glow-red": "0 0 20px rgba(239, 68, 68, 0.15)",
        "iot-glow-blue": "0 0 20px rgba(59, 130, 246, 0.15)",
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
          "linear-gradient(rgba(30, 42, 58, 0.3) 1px, transparent 1px), linear-gradient(90deg, rgba(30, 42, 58, 0.3) 1px, transparent 1px)",
        "gradient-radial": "radial-gradient(var(--tw-gradient-stops))",
      },
    },
  },
  plugins: [],
};

export default config;
