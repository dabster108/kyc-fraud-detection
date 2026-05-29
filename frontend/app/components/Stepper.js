import { Fragment } from "react";
import { CheckIcon } from "./icons";

function StepCircle({ status, number }) {
  if (status === "complete") {
    return (
      <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[var(--brand)] text-white shadow-[0_0_0_6px_rgba(82,196,26,0.12)]">
        <CheckIcon className="h-5 w-5" />
      </div>
    );
  }

  if (status === "active") {
    return (
      <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[var(--brand)] text-sm font-semibold text-white shadow-[0_0_0_6px_rgba(82,196,26,0.18)]">
        {number}
      </div>
    );
  }

  return (
    <div className="flex h-10 w-10 items-center justify-center rounded-full border border-[#CBD5E1] bg-white text-sm font-semibold text-[#94A3B8]">
      {number}
    </div>
  );
}

export default function Stepper({ steps, currentStep }) {
  return (
    <div className="mx-auto flex w-full max-w-3xl items-center">
      {steps.map((item, index) => {
        const status =
          currentStep > item.id
            ? "complete"
            : currentStep === item.id
            ? "active"
            : "inactive";

        return (
          <Fragment key={item.id}>
            <div className="flex min-w-[120px] flex-col items-center gap-2">
              <StepCircle status={status} number={item.id} />
              <span
                className={`text-sm font-semibold ${
                  status === "inactive" ? "text-[#94A3B8]" : "text-[#0F172A]"
                }`}
              >
                {item.label}
              </span>
            </div>
            {index < steps.length - 1 && (
              <div
                className={`mx-4 h-[2px] flex-1 rounded-full ${
                  currentStep > item.id ? "bg-[var(--brand)]" : "bg-[#E5E7EB]"
                }`}
              />
            )}
          </Fragment>
        );
      })}
    </div>
  );
}
