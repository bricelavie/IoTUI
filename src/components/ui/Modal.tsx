import React, { useEffect, useCallback, useRef, useId } from "react";
import { clsx } from "clsx";
import { X, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui";

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
  danger?: boolean;
  width?: "sm" | "md" | "lg";
}

export const Modal: React.FC<ModalProps> = ({
  open,
  onClose,
  title,
  children,
  footer,
  danger = false,
  width = "md",
}) => {
  const titleId = useId();
  const panelRef = useRef<HTMLDivElement>(null);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();

      // Focus trap: cycle focus within the modal
      if (e.key === "Tab" && panelRef.current) {
        const focusable = panelRef.current.querySelectorAll<HTMLElement>(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
        );
        if (focusable.length === 0) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    },
    [onClose]
  );

  useEffect(() => {
    if (!open) return;
    document.addEventListener("keydown", handleKeyDown);

    // Auto-focus the panel so keyboard users start inside the modal
    const timer = setTimeout(() => panelRef.current?.focus(), 0);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      clearTimeout(timer);
    };
  }, [open, handleKeyDown]);

  if (!open) return null;

  const widths = {
    sm: "max-w-sm",
    md: "max-w-md",
    lg: "max-w-lg",
  };

  return (
    <div className="modal-backdrop" onClick={onClose} role="presentation">
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className={clsx(
          "modal-panel w-full mx-4 rounded-lg border shadow-2xl shadow-black/50",
          "bg-iot-bg-surface",
          danger ? "border-iot-red/30" : "border-iot-border",
          widths[width]
        )}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-iot-border">
          <div className="flex items-center gap-2">
            {danger && <AlertTriangle size={16} className="text-iot-red" />}
            <h3 id={titleId} className="text-sm font-semibold text-iot-text-primary">{title}</h3>
          </div>
          <button
            onClick={onClose}
            aria-label="Close dialog"
            className="text-iot-text-disabled hover:text-iot-text-muted transition-colors"
          >
            <X size={16} />
          </button>
        </div>

        {/* Body */}
        <div className="px-4 py-4 text-sm text-iot-text-secondary">
          {children}
        </div>

        {/* Footer */}
        {footer && (
          <div className="flex items-center justify-end gap-2 px-4 py-3 border-t border-iot-border">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
};

// ─── Convenience: Confirm Dialog ──────────────────────────────────

interface ConfirmDialogProps {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  message: string;
  confirmLabel?: string;
  danger?: boolean;
  loading?: boolean;
}

export const ConfirmDialog: React.FC<ConfirmDialogProps> = ({
  open,
  onClose,
  onConfirm,
  title,
  message,
  confirmLabel = "Confirm",
  danger = false,
  loading = false,
}) => (
  <Modal
    open={open}
    onClose={onClose}
    title={title}
    danger={danger}
    width="sm"
    footer={
      <>
        <Button variant="secondary" onClick={onClose} disabled={loading}>
          Cancel
        </Button>
        <Button
          variant={danger ? "danger" : "primary"}
          onClick={onConfirm}
          loading={loading}
        >
          {confirmLabel}
        </Button>
      </>
    }
  >
    <p>{message}</p>
  </Modal>
);
