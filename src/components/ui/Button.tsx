import React from "react";
import { clsx } from "clsx";

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
