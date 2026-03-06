import React, { useEffect, useCallback } from "react";
import { clsx } from "clsx";
import { useNotificationStore, type NotificationType } from "@/stores/notificationStore";
import { X, CheckCircle, AlertTriangle, AlertCircle, Info } from "lucide-react";

const icons: Record<NotificationType, React.ReactNode> = {
  success: <CheckCircle size={16} />,
  error: <AlertCircle size={16} />,
  warning: <AlertTriangle size={16} />,
  info: <Info size={16} />,
};

const colors: Record<NotificationType, { border: string; icon: string; bg: string }> = {
  success: {
    border: "border-iot-cyan/40",
    icon: "text-iot-cyan",
    bg: "bg-iot-cyan/5",
  },
  error: {
    border: "border-iot-red/40",
    icon: "text-iot-red",
    bg: "bg-iot-red/5",
  },
  warning: {
    border: "border-iot-amber/40",
    icon: "text-iot-amber",
    bg: "bg-iot-amber/5",
  },
  info: {
    border: "border-iot-blue/40",
    icon: "text-iot-blue",
    bg: "bg-iot-blue/5",
  },
};

const ToastItem: React.FC<{
  id: string;
  type: NotificationType;
  title: string;
  message?: string;
  duration?: number;
}> = ({ id, type, title, message, duration }) => {
  const removeNotification = useNotificationStore((s) => s.removeNotification);
  const [exiting, setExiting] = React.useState(false);

  const dismiss = useCallback(() => {
    setExiting(true);
    setTimeout(() => removeNotification(id), 200);
  }, [id, removeNotification]);

  useEffect(() => {
    if (!duration || duration === 0) return;
    const timer = setTimeout(dismiss, duration);
    return () => clearTimeout(timer);
  }, [duration, dismiss]);

  const c = colors[type];

  return (
    <div
      className={clsx(
        "toast-item flex items-start gap-2.5 px-3 py-2.5 rounded-lg border backdrop-blur-sm",
        "shadow-lg shadow-black/30 min-w-[280px] max-w-[400px]",
        c.border,
        c.bg,
        "bg-iot-bg-surface/95",
        exiting ? "toast-exit" : "toast-enter"
      )}
      role="alert"
    >
      <span className={clsx("flex-shrink-0 mt-0.5", c.icon)}>{icons[type]}</span>
      <div className="flex-1 min-w-0">
        <p className="text-xs font-semibold text-iot-text-primary">{title}</p>
        {message && (
          <p className="text-2xs text-iot-text-muted mt-0.5 leading-relaxed">{message}</p>
        )}
      </div>
      <button
        onClick={dismiss}
        className="flex-shrink-0 text-iot-text-disabled hover:text-iot-text-muted transition-colors mt-0.5"
      >
        <X size={14} />
      </button>
    </div>
  );
};

export const ToastContainer: React.FC = () => {
  const notifications = useNotificationStore((s) => s.notifications);

  if (notifications.length === 0) return null;

  return (
    <div className="fixed top-3 right-3 z-[9999] flex flex-col gap-2 pointer-events-auto">
      {notifications.map((n) => (
        <ToastItem
          key={n.id}
          id={n.id}
          type={n.type}
          title={n.title}
          message={n.message}
          duration={n.duration}
        />
      ))}
    </div>
  );
};
