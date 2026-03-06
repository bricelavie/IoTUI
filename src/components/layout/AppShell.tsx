import React from "react";

interface AppShellProps {
  children: React.ReactNode;
}

export const AppShell: React.FC<AppShellProps> = ({ children }) => {
  return (
    <div className="h-screen w-screen overflow-hidden bg-iot-bg-base bg-industrial-grid text-iot-text-primary flex flex-col">
      {/* Tauri drag region - top bar */}
      <div
        data-tauri-drag-region
        className="h-8 flex-shrink-0 flex items-center justify-between px-3 bg-iot-bg-surface/80 backdrop-blur border-b border-iot-border select-none"
      >
        <div className="flex items-center gap-2" data-tauri-drag-region>
          <svg width="16" height="16" viewBox="0 0 32 32" className="text-iot-cyan">
            <circle cx="16" cy="16" r="3" fill="currentColor" />
            <circle cx="16" cy="16" r="8" stroke="currentColor" strokeWidth="1.5" fill="none" opacity="0.6" />
            <circle cx="16" cy="16" r="13" stroke="currentColor" strokeWidth="1" fill="none" opacity="0.3" />
            <line x1="16" y1="0" x2="16" y2="6" stroke="currentColor" strokeWidth="1.5" opacity="0.4" />
            <line x1="16" y1="26" x2="16" y2="32" stroke="currentColor" strokeWidth="1.5" opacity="0.4" />
            <line x1="0" y1="16" x2="6" y2="16" stroke="currentColor" strokeWidth="1.5" opacity="0.4" />
            <line x1="26" y1="16" x2="32" y2="16" stroke="currentColor" strokeWidth="1.5" opacity="0.4" />
          </svg>
          <span className="text-xs font-semibold tracking-wider text-iot-text-secondary" data-tauri-drag-region>
            IoTUI
          </span>
          <span className="text-2xs text-iot-text-disabled font-mono">v0.1.0</span>
        </div>
        <div className="flex items-center gap-1 text-2xs text-iot-text-disabled font-mono" data-tauri-drag-region>
          Industrial IoT Utility
        </div>
      </div>
      {/* Main content */}
      <div className="flex-1 min-h-0">
        {children}
      </div>
    </div>
  );
};
