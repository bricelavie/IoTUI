import React, { useId } from "react";
import { clsx } from "clsx";
import { Check } from "lucide-react";

interface CheckboxProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label?: string;
  disabled?: boolean;
  className?: string;
  id?: string;
}

export const Checkbox: React.FC<CheckboxProps> = ({
  checked,
  onChange,
  label,
  disabled = false,
  className,
  id: externalId,
}) => {
  const generatedId = useId();
  const checkboxId = externalId ?? generatedId;

  return (
    <label
      htmlFor={checkboxId}
      className={clsx(
        "inline-flex items-center gap-2 cursor-pointer select-none",
        disabled && "opacity-50 cursor-not-allowed",
        className
      )}
    >
      <button
        id={checkboxId}
        role="checkbox"
        type="button"
        aria-checked={checked}
        disabled={disabled}
        onClick={() => !disabled && onChange(!checked)}
        className={clsx(
          "flex items-center justify-center w-4 h-4 rounded border transition-all duration-150",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-iot-border-focus focus-visible:ring-offset-1 focus-visible:ring-offset-iot-bg-base",
          checked
            ? "bg-iot-cyan/20 border-iot-cyan/50 text-iot-cyan"
            : "bg-iot-bg-base border-iot-border hover:border-iot-border-light"
        )}
      >
        {checked && <Check size={12} strokeWidth={3} />}
      </button>
      {label && (
        <span className="text-xs text-iot-text-secondary">{label}</span>
      )}
    </label>
  );
};
