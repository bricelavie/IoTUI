import React from "react";
import { clsx } from "clsx";

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
