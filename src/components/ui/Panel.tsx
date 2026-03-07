import React from "react";
import { clsx } from "clsx";

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
