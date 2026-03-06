import React from "react";
import { clsx } from "clsx";
import { useAppStore } from "@/stores/appStore";
import { useConnectionStore } from "@/stores/connectionStore";
import type { ViewMode } from "@/types/opcua";
import {
  Zap,
  Network,
  FolderTree,
  Activity,
  PlayCircle,
  Download,
  ChevronLeft,
  ChevronRight,
  Radio,
  Cpu,
  LayoutDashboard,
  AlertTriangle,
} from "lucide-react";

interface NavItem {
  id: ViewMode;
  label: string;
  icon: React.ReactNode;
  requiresConnection?: boolean;
}

const navItems: NavItem[] = [
  { id: "connection", label: "Connect", icon: <Zap size={18} /> },
  { id: "browse", label: "Browse", icon: <FolderTree size={18} />, requiresConnection: true },
  { id: "subscriptions", label: "Monitor", icon: <Activity size={18} />, requiresConnection: true },
  { id: "dashboard", label: "Dashboard", icon: <LayoutDashboard size={18} />, requiresConnection: true },
  { id: "events", label: "Events", icon: <AlertTriangle size={18} />, requiresConnection: true },
  { id: "methods", label: "Methods", icon: <PlayCircle size={18} />, requiresConnection: true },
  { id: "export", label: "Export", icon: <Download size={18} />, requiresConnection: true },
];

const protocolItems = [
  { id: "opcua" as const, label: "OPC UA", icon: <Network size={16} />, active: true },
  { id: "mqtt" as const, label: "MQTT", icon: <Radio size={16} />, active: false },
  { id: "modbus" as const, label: "Modbus", icon: <Cpu size={16} />, active: false },
];

export const Sidebar: React.FC = () => {
  const { activeView, setActiveView, sidebarCollapsed, toggleSidebar, activeProtocol } = useAppStore();
  const { activeConnectionId } = useConnectionStore();

  return (
    <div
      className={clsx(
        "flex flex-col h-full bg-iot-bg-surface border-r border-iot-border transition-all duration-200 flex-shrink-0",
        sidebarCollapsed ? "w-12" : "w-48"
      )}
    >
      {/* Protocol selector */}
      <div className="px-2 py-2 border-b border-iot-border">
        {protocolItems.map((p) => (
          <button
            key={p.id}
            disabled={!p.active}
            className={clsx(
              "flex items-center gap-2 w-full rounded px-2 py-1.5 text-xs font-medium transition-colors duration-100",
              p.id === activeProtocol
                ? "bg-iot-cyan/10 text-iot-cyan"
                : p.active
                ? "text-iot-text-muted hover:text-iot-text-secondary hover:bg-iot-bg-hover"
                : "text-iot-text-disabled cursor-not-allowed opacity-50"
            )}
            title={!p.active ? "Coming soon" : undefined}
          >
            {p.icon}
            {!sidebarCollapsed && <span>{p.label}</span>}
            {!sidebarCollapsed && !p.active && (
              <span className="ml-auto text-2xs bg-iot-bg-elevated border border-iot-border rounded px-1">Soon</span>
            )}
          </button>
        ))}
      </div>

      {/* Navigation */}
      <nav className="flex-1 py-2 px-2 space-y-0.5 overflow-y-auto">
        {navItems.map((item) => {
          const disabled = item.requiresConnection && !activeConnectionId;
          return (
            <button
              key={item.id}
              onClick={() => !disabled && setActiveView(item.id)}
              disabled={disabled}
              className={clsx(
                "flex items-center gap-2.5 w-full rounded px-2 py-2 text-xs font-medium transition-all duration-100",
                activeView === item.id
                  ? "bg-iot-cyan/10 text-iot-cyan border border-iot-cyan/20"
                  : disabled
                  ? "text-iot-text-disabled cursor-not-allowed"
                  : "text-iot-text-muted hover:text-iot-text-secondary hover:bg-iot-bg-hover border border-transparent"
              )}
              title={sidebarCollapsed ? item.label : undefined}
            >
              <span className="flex-shrink-0">{item.icon}</span>
              {!sidebarCollapsed && <span>{item.label}</span>}
            </button>
          );
        })}
      </nav>

      {/* Collapse toggle - matches StatusBar h-6 */}
      <button
        onClick={toggleSidebar}
        className="flex items-center justify-center h-6 flex-shrink-0 text-iot-text-disabled hover:text-iot-text-muted transition-colors"
      >
        {sidebarCollapsed ? <ChevronRight size={14} /> : <ChevronLeft size={14} />}
      </button>
    </div>
  );
};
