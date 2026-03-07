import React, { useId } from "react";
import { clsx } from "clsx";

interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
  options: { value: string; label: string; disabled?: boolean }[];
}

export const Select: React.FC<SelectProps> = ({
  label,
  options,
  className,
  id: externalId,
  ...props
}) => {
  const generatedId = useId();
  const selectId = externalId ?? generatedId;

  return (
    <div className="flex flex-col gap-1">
      {label && (
        <label htmlFor={selectId} className="text-xs text-iot-text-muted font-medium">{label}</label>
      )}
      <select
        id={selectId}
        className={clsx(
          "bg-iot-bg-base border border-iot-border rounded px-3 py-1.5 text-sm text-iot-text-primary",
          "focus:outline-none focus:border-iot-border-focus",
          "transition-colors duration-150 appearance-none cursor-pointer",
          className
        )}
        {...props}
      >
        {options.map((opt) => (
          <option key={opt.value} value={opt.value} disabled={opt.disabled}>
            {opt.label}
          </option>
        ))}
      </select>
    </div>
  );
};
