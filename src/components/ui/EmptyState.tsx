import React from "react";

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
