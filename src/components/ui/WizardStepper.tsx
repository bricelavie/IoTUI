import React from "react";
import { clsx } from "clsx";
import { Check, ChevronRight, ChevronLeft } from "lucide-react";
import { Button } from "./Button";

// ─── Types ───────────────────────────────────────────────────────

export interface WizardStep {
  id: string;
  label: string;
  description?: string;
  icon?: React.ReactNode;
}

interface WizardStepperProps {
  steps: WizardStep[];
  activeStep: number;
  className?: string;
}

interface WizardContainerProps {
  steps: WizardStep[];
  activeStep: number;
  onNext: () => void;
  onBack: () => void;
  onCancel: () => void;
  onComplete: () => void;
  canProceed: boolean;
  isCompleting?: boolean;
  completeLabel?: string;
  children: React.ReactNode;
  className?: string;
}

// ─── Step Indicator ──────────────────────────────────────────────

export const WizardStepIndicator: React.FC<WizardStepperProps> = ({
  steps,
  activeStep,
  className,
}) => (
  <div className={clsx("flex items-center justify-center gap-1", className)}>
    {steps.map((step, index) => {
      const isActive = index === activeStep;
      const isCompleted = index < activeStep;
      const isPending = index > activeStep;

      return (
        <React.Fragment key={step.id}>
          {index > 0 && (
            <div
              className={clsx(
                "h-px w-8 transition-colors duration-200",
                isCompleted ? "bg-iot-cyan" : "bg-iot-border"
              )}
            />
          )}
          <div className="flex items-center gap-2">
            <div
              className={clsx(
                "flex items-center justify-center w-7 h-7 rounded-full text-2xs font-bold transition-all duration-200 border-2",
                isCompleted && "bg-iot-cyan border-iot-cyan text-white",
                isActive &&
                  "border-iot-cyan text-iot-cyan bg-iot-cyan/10 ring-2 ring-iot-cyan/20",
                isPending &&
                  "border-iot-border text-iot-text-disabled bg-iot-bg-base"
              )}
            >
              {isCompleted ? <Check size={12} strokeWidth={3} /> : index + 1}
            </div>
            <span
              className={clsx(
                "text-xs font-medium hidden sm:block transition-colors duration-200",
                isActive && "text-iot-text-primary",
                isCompleted && "text-iot-cyan",
                isPending && "text-iot-text-disabled"
              )}
            >
              {step.label}
            </span>
          </div>
        </React.Fragment>
      );
    })}
  </div>
);

// ─── Wizard Container ────────────────────────────────────────────

export const WizardContainer: React.FC<WizardContainerProps> = ({
  steps,
  activeStep,
  onNext,
  onBack,
  onCancel,
  onComplete,
  canProceed,
  isCompleting = false,
  completeLabel = "Connect",
  children,
  className,
}) => {
  const isFirstStep = activeStep === 0;
  const isLastStep = activeStep === steps.length - 1;

  return (
    <div className={clsx("flex flex-col h-full", className)}>
      {/* Step indicator */}
      <div className="flex-shrink-0 px-6 pt-5 pb-4 border-b border-iot-border bg-iot-bg-surface/30">
        <WizardStepIndicator steps={steps} activeStep={activeStep} />
        <p className="text-center text-xs text-iot-text-muted mt-2.5">
          {steps[activeStep]?.description}
        </p>
      </div>

      {/* Step content */}
      <div className="flex-1 overflow-auto px-6 py-5">
        {children}
      </div>

      {/* Footer navigation */}
      <div className="flex-shrink-0 flex items-center justify-between px-6 py-3 border-t border-iot-border bg-iot-bg-surface/30">
        <div>
          {isFirstStep ? (
            <Button variant="ghost" size="sm" onClick={onCancel}>
              Cancel
            </Button>
          ) : (
            <Button variant="ghost" size="sm" onClick={onBack}>
              <ChevronLeft size={14} />
              Back
            </Button>
          )}
        </div>
        <div className="flex items-center gap-2">
          <span className="text-2xs text-iot-text-disabled">
            Step {activeStep + 1} of {steps.length}
          </span>
          {isLastStep ? (
            <Button
              variant="primary"
              size="sm"
              onClick={onComplete}
              loading={isCompleting}
              disabled={!canProceed}
            >
              {completeLabel}
            </Button>
          ) : (
            <Button
              variant="primary"
              size="sm"
              onClick={onNext}
              disabled={!canProceed}
            >
              Next
              <ChevronRight size={14} />
            </Button>
          )}
        </div>
      </div>
    </div>
  );
};

// ─── Mode Selection Card ─────────────────────────────────────────

interface ModeCardProps {
  icon: React.ReactNode;
  title: string;
  description: string;
  selected: boolean;
  onClick: () => void;
  accentColor?: string;
}

export const ModeCard: React.FC<ModeCardProps> = ({
  icon,
  title,
  description,
  selected,
  onClick,
  accentColor = "iot-cyan",
}) => (
  <button
    onClick={onClick}
    className={clsx(
      "flex-1 flex flex-col items-center gap-3 p-6 rounded-xl border-2 transition-all duration-200 text-center group",
      selected
        ? `bg-${accentColor}/5 border-${accentColor}/50 ring-2 ring-${accentColor}/20`
        : "bg-iot-bg-base border-iot-border hover:border-iot-border-light hover:bg-iot-bg-hover"
    )}
    style={
      selected
        ? {
            backgroundColor: `var(--color-${accentColor}, rgb(0 210 211)) / 0.05`,
            borderColor: `var(--color-${accentColor}, rgb(0 210 211)) / 0.5`,
          }
        : undefined
    }
  >
    <div
      className={clsx(
        "w-12 h-12 rounded-xl flex items-center justify-center transition-colors duration-200",
        selected
          ? "bg-iot-cyan/10 text-iot-cyan"
          : "bg-iot-bg-elevated text-iot-text-muted group-hover:text-iot-text-secondary"
      )}
    >
      {icon}
    </div>
    <div>
      <h4
        className={clsx(
          "text-sm font-semibold transition-colors duration-200",
          selected ? "text-iot-text-primary" : "text-iot-text-secondary"
        )}
      >
        {title}
      </h4>
      <p className="text-xs text-iot-text-muted mt-1 leading-relaxed">
        {description}
      </p>
    </div>
    <div
      className={clsx(
        "w-4 h-4 rounded-full border-2 transition-all duration-200",
        selected
          ? "border-iot-cyan bg-iot-cyan"
          : "border-iot-border"
      )}
    >
      {selected && (
        <Check size={10} className="text-white m-auto mt-[1px]" strokeWidth={3} />
      )}
    </div>
  </button>
);

// ─── Review Row ──────────────────────────────────────────────────

interface ReviewRowProps {
  label: string;
  value: React.ReactNode;
  onEdit?: () => void;
}

export const ReviewRow: React.FC<ReviewRowProps> = ({ label, value, onEdit }) => (
  <div className="flex items-center justify-between py-2 border-b border-iot-border last:border-b-0">
    <span className="text-xs text-iot-text-muted">{label}</span>
    <div className="flex items-center gap-2">
      <span className="text-xs text-iot-text-primary font-medium">{value}</span>
      {onEdit && (
        <button
          onClick={onEdit}
          className="text-2xs text-iot-cyan hover:text-iot-cyan/80 transition-colors"
        >
          Edit
        </button>
      )}
    </div>
  </div>
);

// ─── Review Section ──────────────────────────────────────────────

interface ReviewSectionProps {
  title: string;
  icon?: React.ReactNode;
  children: React.ReactNode;
  onEdit?: () => void;
}

export const ReviewSection: React.FC<ReviewSectionProps> = ({
  title,
  icon,
  children,
  onEdit,
}) => (
  <div className="rounded-lg border border-iot-border bg-iot-bg-base p-4">
    <div className="flex items-center justify-between mb-3">
      <h4 className="text-xs font-semibold text-iot-text-secondary flex items-center gap-2">
        {icon}
        {title}
      </h4>
      {onEdit && (
        <button
          onClick={onEdit}
          className="text-2xs text-iot-cyan hover:text-iot-cyan/80 transition-colors"
        >
          Edit
        </button>
      )}
    </div>
    <div>{children}</div>
  </div>
);
