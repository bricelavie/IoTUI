import React, { useId } from "react";
import { clsx } from "clsx";
import { ChevronDown } from "lucide-react";

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
      <div className="relative">
        <select
          id={selectId}
          className={clsx(
            "w-full bg-iot-bg-base border border-iot-border rounded px-3 py-1.5 pr-8 text-sm text-iot-text-primary",
            "focus:outline-none focus:border-iot-border-focus focus:ring-1 focus:ring-iot-border-focus/30",
            "focus-visible:ring-2 focus-visible:ring-iot-border-focus focus-visible:ring-offset-1 focus-visible:ring-offset-iot-bg-base",
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
        <ChevronDown
          size={14}
          className="absolute right-2 top-1/2 -translate-y-1/2 text-iot-text-muted pointer-events-none"
        />
      </div>
    </div>
  );
};
