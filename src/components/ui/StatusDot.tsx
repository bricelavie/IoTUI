import React from "react";

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
