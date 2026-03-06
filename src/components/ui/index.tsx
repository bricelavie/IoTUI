import React from "react";
import { clsx } from "clsx";

// ─── Button ──────────────────────────────────────────────────────

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary" | "ghost" | "danger" | "accent";
  size?: "xs" | "sm" | "md";
  loading?: boolean;
}

export const Button: React.FC<ButtonProps> = ({
  variant = "secondary",
  size = "sm",
  loading,
  className,
  children,
  disabled,
  ...props
}) => {
  const base =
    "inline-flex items-center justify-center gap-1.5 font-medium rounded transition-all duration-150 no-select border";
  const sizes = {
    xs: "px-2 py-0.5 text-2xs",
    sm: "px-3 py-1.5 text-xs",
    md: "px-4 py-2 text-sm",
  };
  const variants = {
    primary:
      "bg-iot-cyan/20 text-iot-cyan border-iot-cyan/30 hover:bg-iot-cyan/30 hover:border-iot-cyan/50 active:bg-iot-cyan/40",
    secondary:
      "bg-iot-bg-elevated text-iot-text-secondary border-iot-border hover:bg-iot-bg-hover hover:text-iot-text-primary hover:border-iot-border-light",
    ghost:
      "bg-transparent text-iot-text-muted border-transparent hover:bg-iot-bg-elevated hover:text-iot-text-secondary",
    danger:
      "bg-iot-red/10 text-iot-red border-iot-red/20 hover:bg-iot-red/20 hover:border-iot-red/40",
    accent:
      "bg-iot-amber/10 text-iot-amber border-iot-amber/20 hover:bg-iot-amber/20 hover:border-iot-amber/40",
  };

  return (
    <button
      className={clsx(
        base,
        sizes[size],
        variants[variant],
        (disabled || loading) && "opacity-50 cursor-not-allowed",
        className
      )}
      disabled={disabled || loading}
      {...props}
    >
      {loading && (
        <svg
          className="animate-spin h-3 w-3"
          viewBox="0 0 24 24"
          fill="none"
        >
          <circle
            className="opacity-25"
            cx="12"
            cy="12"
            r="10"
            stroke="currentColor"
            strokeWidth="4"
          />
          <path
            className="opacity-75"
            fill="currentColor"
            d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
          />
        </svg>
      )}
      {children}
    </button>
  );
};

// ─── Input ───────────────────────────────────────────────────────

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
}

export const Input: React.FC<InputProps> = ({
  label,
  error,
  className,
  ...props
}) => (
  <div className="flex flex-col gap-1">
    {label && (
      <label className="text-xs text-iot-text-muted font-medium">{label}</label>
    )}
    <input
      className={clsx(
        "bg-iot-bg-base border border-iot-border rounded px-3 py-1.5 text-sm text-iot-text-primary",
        "placeholder:text-iot-text-disabled",
        "focus:outline-none focus:border-iot-border-focus focus:ring-1 focus:ring-iot-border-focus/30",
        "transition-colors duration-150",
        error && "border-iot-red focus:border-iot-red",
        className
      )}
      {...props}
    />
    {error && <span className="text-2xs text-iot-red">{error}</span>}
  </div>
);

// ─── Select ──────────────────────────────────────────────────────

interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
  options: { value: string; label: string }[];
}

export const Select: React.FC<SelectProps> = ({
  label,
  options,
  className,
  ...props
}) => (
  <div className="flex flex-col gap-1">
    {label && (
      <label className="text-xs text-iot-text-muted font-medium">{label}</label>
    )}
    <select
      className={clsx(
        "bg-iot-bg-base border border-iot-border rounded px-3 py-1.5 text-sm text-iot-text-primary",
        "focus:outline-none focus:border-iot-border-focus",
        "transition-colors duration-150 appearance-none cursor-pointer",
        className
      )}
      {...props}
    >
      {options.map((opt) => (
        <option key={opt.value} value={opt.value}>
          {opt.label}
        </option>
      ))}
    </select>
  </div>
);

// ─── Card ────────────────────────────────────────────────────────

interface CardProps {
  children: React.ReactNode;
  className?: string;
  glow?: "cyan" | "amber" | "red" | "none";
  interactive?: boolean;
}

export const Card: React.FC<CardProps> = ({
  children,
  className,
  glow = "none",
  interactive = false,
}) => (
  <div
    className={clsx(
      interactive ? "iot-card-interactive" : "iot-card",
      glow === "cyan" && "glow-cyan",
      glow === "amber" && "glow-amber",
      glow === "red" && "glow-red",
      className
    )}
  >
    {children}
  </div>
);

// ─── Badge ───────────────────────────────────────────────────────

interface BadgeProps {
  children: React.ReactNode;
  variant?: "default" | "success" | "warning" | "danger" | "info";
  className?: string;
}

export const Badge: React.FC<BadgeProps> = ({
  children,
  variant = "default",
  className,
}) => {
  const variants = {
    default: "bg-iot-bg-elevated text-iot-text-secondary border-iot-border",
    success: "bg-iot-cyan/10 text-iot-cyan border-iot-cyan/20",
    warning: "bg-iot-amber/10 text-iot-amber border-iot-amber/20",
    danger: "bg-iot-red/10 text-iot-red border-iot-red/20",
    info: "bg-iot-blue/10 text-iot-blue border-iot-blue/20",
  };

  return (
    <span
      className={clsx(
        "inline-flex items-center px-1.5 py-0.5 rounded text-2xs font-medium border",
        variants[variant],
        className
      )}
    >
      {children}
    </span>
  );
};

// ─── StatusDot ───────────────────────────────────────────────────

export const StatusDot: React.FC<{
  status: "connected" | "warning" | "error" | "disconnected";
}> = ({ status }) => {
  const classes = {
    connected: "status-dot-connected",
    warning: "status-dot-warning",
    error: "status-dot-error",
    disconnected: "status-dot-disconnected",
  };
  return <span className={classes[status]} />;
};

// ─── Tabs ────────────────────────────────────────────────────────

interface TabsProps {
  tabs: { id: string; label: string; icon?: React.ReactNode }[];
  activeTab: string;
  onTabChange: (id: string) => void;
  className?: string;
}

export const Tabs: React.FC<TabsProps> = ({
  tabs,
  activeTab,
  onTabChange,
  className,
}) => (
  <div className={clsx("flex items-center gap-0 border-b border-iot-border", className)}>
    {tabs.map((tab) => (
      <button
        key={tab.id}
        className={clsx("iot-tab", activeTab === tab.id && "active")}
        onClick={() => onTabChange(tab.id)}
      >
        <span className="flex items-center gap-1.5">
          {tab.icon}
          {tab.label}
        </span>
      </button>
    ))}
  </div>
);

// ─── EmptyState ──────────────────────────────────────────────────

export const EmptyState: React.FC<{
  icon?: React.ReactNode;
  title: string;
  description?: string;
  action?: React.ReactNode;
}> = ({ icon, title, description, action }) => (
  <div className="flex flex-col items-center justify-center gap-3 py-12 text-center">
    {icon && (
      <div className="text-iot-text-disabled">{icon}</div>
    )}
    <div>
      <p className="text-sm font-medium text-iot-text-secondary">{title}</p>
      {description && (
        <p className="text-xs text-iot-text-muted mt-1">{description}</p>
      )}
    </div>
    {action}
  </div>
);

// ─── Spinner ─────────────────────────────────────────────────────

export const Spinner: React.FC<{ size?: number; className?: string }> = ({
  size = 16,
  className,
}) => (
  <svg
    className={clsx("animate-spin text-iot-cyan", className)}
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
  >
    <circle
      className="opacity-25"
      cx="12"
      cy="12"
      r="10"
      stroke="currentColor"
      strokeWidth="3"
    />
    <path
      className="opacity-75"
      fill="currentColor"
      d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
    />
  </svg>
);

// ─── Panel ───────────────────────────────────────────────────────

interface PanelProps {
  title: string;
  children: React.ReactNode;
  headerRight?: React.ReactNode;
  className?: string;
  noPadding?: boolean;
}

export const Panel: React.FC<PanelProps> = ({
  title,
  children,
  headerRight,
  className,
  noPadding = false,
}) => (
  <div className={clsx("flex flex-col h-full", className)}>
    <div className="panel-header flex-shrink-0">
      <span className="panel-title">{title}</span>
      {headerRight}
    </div>
    <div className={clsx("flex-1 overflow-auto", !noPadding && "p-3")}>
      {children}
    </div>
  </div>
);

// ─── Tooltip ─────────────────────────────────────────────────────

export const Tooltip: React.FC<{
  content: string;
  children: React.ReactNode;
}> = ({ content, children }) => (
  <div className="relative group">
    {children}
    <div className="absolute z-50 bottom-full left-1/2 -translate-x-1/2 mb-1.5 px-2 py-1 bg-iot-bg-elevated border border-iot-border rounded text-2xs text-iot-text-secondary whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
      {content}
    </div>
  </div>
);
