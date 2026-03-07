import React, { useId } from "react";
import { clsx } from "clsx";

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
}

export const Input: React.FC<InputProps> = ({
  label,
  error,
  className,
  id: externalId,
  ...props
}) => {
  const generatedId = useId();
  const inputId = externalId ?? generatedId;

  return (
    <div className="flex flex-col gap-1">
      {label && (
        <label htmlFor={inputId} className="text-xs text-iot-text-muted font-medium">{label}</label>
      )}
      <input
        id={inputId}
        className={clsx(
          "bg-iot-bg-base border border-iot-border rounded px-3 py-1.5 text-sm text-iot-text-primary",
          "placeholder:text-iot-text-disabled",
          "focus:outline-none focus:border-iot-border-focus focus:ring-1 focus:ring-iot-border-focus/30",
          "transition-colors duration-150",
          error && "border-iot-red focus:border-iot-red",
          className
        )}
        {...props}
      />
      {error && <span className="text-2xs text-iot-red">{error}</span>}
    </div>
  );
};
