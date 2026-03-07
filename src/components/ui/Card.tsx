import React from "react";
import { clsx } from "clsx";

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
