import React from "react";
import { clsx } from "clsx";

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
  <div role="tablist" className={clsx("flex items-center gap-0 border-b border-iot-border", className)}>
    {tabs.map((tab) => (
      <button
        key={tab.id}
        role="tab"
        aria-selected={activeTab === tab.id}
        tabIndex={activeTab === tab.id ? 0 : -1}
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
