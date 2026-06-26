"use client";

export type WizardStep = "intent" | "decide" | "execute";

const STEPS: { id: WizardStep; label: string; icon: string }[] = [
  { id: "intent", label: "意图", icon: "🎯" },
  { id: "decide", label: "决策", icon: "⚖️" },
  { id: "execute", label: "行程", icon: "📅" },
];

interface WizardStepperProps {
  active: WizardStep;
  onChange?: (step: WizardStep) => void;
  maxReachable?: WizardStep;
}

const ORDER: WizardStep[] = ["intent", "decide", "execute"];

function stepIndex(s: WizardStep): number {
  return ORDER.indexOf(s);
}

export default function WizardStepper({ active, onChange, maxReachable = "execute" }: WizardStepperProps) {
  const maxIdx = stepIndex(maxReachable);

  return (
    <nav className="wizard-stepper" aria-label="规划向导">
      {STEPS.map((step, i) => {
        const idx = stepIndex(step.id);
        const isActive = active === step.id;
        const isDone = idx < stepIndex(active);
        const clickable = onChange && idx <= maxIdx;
        const disabled = idx > maxIdx;

        return (
          <button
            key={step.id}
            type="button"
            disabled={!clickable || disabled}
            onClick={() => clickable && onChange?.(step.id)}
            className={`wizard-step ${isActive ? "active" : ""} ${isDone ? "done" : ""}`}
            aria-current={isActive ? "step" : undefined}
          >
            <span className="wizard-step-icon">{isDone ? "✓" : step.icon}</span>
            <span className="wizard-step-label">{step.label}</span>
          </button>
        );
      })}
    </nav>
  );
}
