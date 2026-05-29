import { CameraIcon } from "../icons";

export default function FaceVerificationStep({
  cameraReady,
  cameraError,
  videoRef,
  onStartCamera,
  captureSteps,
  currentCaptureIndex,
  onCapture,
  onRetakeCapture,
  onUndoCapture,
  recordingStatus,
}) {
  const currentStep =
    currentCaptureIndex >= 0 ? captureSteps[currentCaptureIndex] : null;

  return (
    <div className="space-y-8">
      <div className="space-y-2">
        <h1 className="font-display text-3xl text-[#0B1324]">
          Face Verification
        </h1>
        <p className="text-sm text-[#64748B]">
          Follow the prompts to capture front, left, and right angles.
        </p>
      </div>

      <div className="grid gap-8 lg:grid-cols-[1.2fr_0.8fr]">
        <div className="flex flex-col items-center gap-6">
          <div className="relative flex h-64 w-64 items-center justify-center overflow-hidden rounded-full border border-[#CBD5E1] bg-[#EEF2F6]">
            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted
              className={`h-full w-full object-cover transition-opacity ${
                cameraReady ? "opacity-100" : "opacity-0"
              }`}
            />
            {!cameraReady && (
              <CameraIcon className="absolute h-12 w-12 text-[#94A3B8]" />
            )}
          </div>

          {!cameraReady ? (
            <>
              <p className="text-sm text-[#64748B]">
                Click the button below to start face capture.
              </p>
              {cameraError && (
                <p className="text-xs font-medium text-[#E11D48]">
                  Camera unavailable. Please check permissions.
                </p>
              )}
              <button
                onClick={onStartCamera}
                className="flex w-full max-w-xs items-center justify-center gap-3 rounded-xl bg-[var(--brand)] px-6 py-3 text-sm font-semibold text-white shadow-[0_10px_20px_rgba(82,196,26,0.35)]"
              >
                <CameraIcon className="h-4 w-4 text-white" />
                Start Face Capture
              </button>
            </>
          ) : (
            <>
              <p className="text-sm font-medium text-[#0F172A]">
                {currentStep
                  ? `Look ${currentStep.label.toLowerCase()} and capture.`
                  : "All angles captured. Review or retake if needed."}
              </p>
              <div className="flex flex-wrap items-center gap-3 text-xs font-semibold text-[#64748B]">
                <span className="rounded-full bg-[#F1F5F9] px-3 py-1">
                  Video: {recordingStatus}
                </span>
                <span className="rounded-full bg-[#F1F5F9] px-3 py-1">
                  {currentStep ? `Next: ${currentStep.label}` : "Capture complete"}
                </span>
              </div>
              <button
                onClick={onCapture}
                disabled={!currentStep}
                className={`flex w-full max-w-xs items-center justify-center gap-3 rounded-xl px-6 py-3 text-sm font-semibold text-white shadow-[0_10px_20px_rgba(82,196,26,0.35)] ${
                  currentStep
                    ? "bg-[var(--brand)]"
                    : "cursor-not-allowed bg-[#9CA3AF]"
                }`}
              >
                <CameraIcon className="h-4 w-4 text-white" />
                {currentStep ? `Capture ${currentStep.label}` : "Capture Complete"}
              </button>
            </>
          )}
        </div>

        <div className="space-y-4">
          <p className="text-sm font-semibold text-[#0F172A]">
            Capture checklist
          </p>
          <div className="space-y-3">
            {captureSteps.map((step, index) => (
              <div
                key={step.key}
                className={`flex items-center gap-4 rounded-2xl border px-4 py-3 ${
                  step.image
                    ? "border-[#E2E8F0] bg-white"
                    : "border-dashed border-[#CBD5E1] bg-[#F8FAFC]"
                }`}
              >
                <div className="h-14 w-14 overflow-hidden rounded-xl bg-[#E2E8F0]">
                  {step.image ? (
                    <img
                      src={step.image}
                      alt={`${step.label} capture`}
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center text-xs font-semibold text-[#64748B]">
                      {step.label}
                    </div>
                  )}
                </div>
                <div className="flex-1">
                  <p className="text-sm font-semibold text-[#0B1324]">
                    {step.label} view
                  </p>
                  <p className="text-xs text-[#64748B]">
                    {step.image ? "Captured" : "Pending"}
                  </p>
                </div>
                <div className="flex flex-col gap-2 text-xs font-semibold">
                  <button
                    type="button"
                    onClick={() => onRetakeCapture(index)}
                    disabled={!step.image}
                    className={`rounded-full px-3 py-1 ${
                      step.image
                        ? "bg-[#F1F5F9] text-[#0F172A]"
                        : "cursor-not-allowed bg-[#E2E8F0] text-[#94A3B8]"
                    }`}
                  >
                    Retake
                  </button>
                  <button
                    type="button"
                    onClick={() => onUndoCapture(index)}
                    disabled={!step.image}
                    className={`rounded-full px-3 py-1 ${
                      step.image
                        ? "bg-[#F1F5F9] text-[#0F172A]"
                        : "cursor-not-allowed bg-[#E2E8F0] text-[#94A3B8]"
                    }`}
                  >
                    Undo
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
