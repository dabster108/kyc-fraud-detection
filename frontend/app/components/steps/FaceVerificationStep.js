"use client";

import { CameraIcon } from "../icons";
import useLivenessFlow from "../../../hooks/useLivenessFlow";

function ScoreRing({ value, label, color }) {
  const pct = value == null ? 0 : Math.round(value * 100);
  return (
    <div className="rounded-2xl border border-[#E2E8F0] bg-[#F8FAFC] px-5 py-4 text-center">
      <p className={`font-display text-4xl font-bold ${color}`}>
        {value == null ? "—" : `${pct}%`}
      </p>
      <p className="mt-1 text-xs font-semibold text-[#64748B]">{label}</p>
    </div>
  );
}

export default function FaceVerificationStep({
  cameraReady,
  cameraError,
  videoRef,
  onStartCamera,
  sessionId,
  onVerificationComplete,
  onVerificationError,
}) {
  const {
    phase,
    challenge,
    faceDetected,
    blinkCount,
    movementCount,
    minBlinks,
    captures,
    livenessResult,
    faceSimilarity,
    faceIsMatch,
    verifyError,
    reset,
  } = useLivenessFlow({
    videoRef,
    cameraReady,
    sessionId,
    onComplete: onVerificationComplete,
    onError: onVerificationError,
  });

  const showResults = phase === "complete" || phase === "verifying";
  const livenessPct = livenessResult?.confidence_score != null
    ? Math.round(livenessResult.confidence_score * 100)
    : null;

  return (
    <div className="space-y-8">
      <div className="space-y-2">
        <h1 className="font-display text-3xl text-[#0B1324]">
          Face Verification
        </h1>
        <p className="text-sm text-[#64748B]">
          Follow the on-screen guide — look forward, blink, then turn left and right.
          We verify liveness and match your face to your document automatically.
        </p>
      </div>

      <div className="grid gap-8 lg:grid-cols-[1.1fr_0.9fr]">
        <div className="flex flex-col items-center gap-5">
          <div className="relative h-72 w-72">
            <div className="relative flex h-full w-full items-center justify-center overflow-hidden rounded-full border-2 border-[#CBD5E1] bg-[#EEF2F6] shadow-inner">
              <video
                ref={videoRef}
                autoPlay
                playsInline
                muted
                className={`h-full w-full scale-x-[-1] object-cover transition-opacity ${
                  cameraReady ? "opacity-100" : "opacity-0"
                }`}
              />
              {!cameraReady && (
                <CameraIcon className="absolute h-12 w-12 text-[#94A3B8]" />
              )}

              {cameraReady && phase !== "complete" && phase !== "verifying" && (
                <div
                  className={`pointer-events-none absolute inset-0 rounded-full ring-4 transition-colors ${
                    faceDetected ? "ring-[var(--brand)]/40" : "ring-amber-400/50"
                  }`}
                />
              )}

              {cameraReady && phase !== "loading" && (
                <div className="pointer-events-none absolute inset-x-0 bottom-4 z-10 flex flex-col items-center gap-1 px-4">
                  <div
                    className="flex h-14 w-14 items-center justify-center rounded-full border-2 border-white bg-[var(--brand)] text-2xl shadow-lg"
                    aria-hidden
                  >
                    {challenge.emoji}
                  </div>
                  <p className="rounded-full bg-black/55 px-3 py-1 text-xs font-semibold text-white">
                    {challenge.label}
                  </p>
                </div>
              )}
            </div>

            {cameraReady && (
              <div className="mt-4 text-center">
                <p className="text-sm text-[#64748B]">{challenge.hint}</p>
                {!faceDetected && phase !== "loading" && phase !== "complete" && (
                  <p className="mt-2 text-xs font-medium text-amber-600">
                    Position your face inside the oval
                  </p>
                )}
              </div>
            )}
          </div>

          {!cameraReady ? (
            <>
              <p className="text-sm text-[#64748B]">
                Allow camera access to start liveness verification.
              </p>
              {cameraError && (
                <p className="text-xs font-medium text-[#E11D48]">
                  Camera unavailable. Please check permissions.
                </p>
              )}
              <button
                type="button"
                onClick={onStartCamera}
                className="flex w-full max-w-xs items-center justify-center gap-3 rounded-xl bg-[var(--brand)] px-6 py-3 text-sm font-semibold text-white shadow-[0_10px_20px_rgba(82,196,26,0.35)]"
              >
                <CameraIcon className="h-4 w-4 text-white" />
                Start Verification
              </button>
            </>
          ) : null}

          {phase === "failed" && (
            <button
              type="button"
              onClick={reset}
              className="rounded-xl border border-[#E2E8F0] px-6 py-2.5 text-sm font-semibold text-[#0F172A] hover:bg-[#F8FAFC]"
            >
              Try again
            </button>
          )}

          {verifyError && (
            <p className="text-center text-xs font-medium text-[#E11D48]">
              {verifyError}
            </p>
          )}
        </div>

        <div className="space-y-4">
          <p className="text-sm font-semibold text-[#0F172A]">Progress</p>

          <div className="space-y-2">
            {[
              { key: "forward", label: "Look forward", done: Boolean(captures.front) },
              {
                key: "blink",
                label: `Blink (${blinkCount}/${minBlinks})`,
                done: blinkCount >= minBlinks,
              },
              { key: "left", label: "Turn left", done: Boolean(captures.left) },
              { key: "right", label: "Turn right", done: Boolean(captures.right) },
            ].map((item) => (
              <div
                key={item.key}
                className={`flex items-center gap-3 rounded-xl border px-4 py-3 text-sm ${
                  item.done
                    ? "border-green-200 bg-green-50 text-green-800"
                    : "border-[#E2E8F0] bg-white text-[#64748B]"
                }`}
              >
                <span
                  className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
                    item.done ? "bg-green-500 text-white" : "bg-[#E2E8F0] text-[#64748B]"
                  }`}
                >
                  {item.done ? "✓" : "·"}
                </span>
                {item.label}
              </div>
            ))}
          </div>

          {cameraReady && phase !== "loading" && (
            <div className="flex gap-3 text-xs text-[#64748B]">
              <span className="rounded-full bg-[#F1F5F9] px-3 py-1">
                Blinks: {blinkCount}
              </span>
              <span className="rounded-full bg-[#F1F5F9] px-3 py-1">
                Movements: {movementCount}
              </span>
            </div>
          )}

          {showResults && (
            <div className="space-y-4 rounded-2xl border border-[#E2E8F0] bg-white p-5">
              <p className="text-sm font-semibold text-[#0F172A]">
                {phase === "verifying" ? "Analyzing…" : "Verification scores"}
              </p>
              <div className="grid grid-cols-2 gap-3">
                <ScoreRing
                  value={livenessResult?.confidence_score ?? null}
                  label="Liveness confidence"
                  color="text-[#0EA5E9]"
                />
                <ScoreRing
                  value={faceSimilarity}
                  label="ID face match"
                  color={
                    faceIsMatch === true
                      ? "text-green-600"
                      : faceIsMatch === false
                        ? "text-red-600"
                        : "text-[#64748B]"
                  }
                />
              </div>
              {phase === "complete" && (
                <div className="space-y-1 text-xs text-[#64748B]">
                  {livenessResult?.is_live && (
                    <p className="font-medium text-green-700">Liveness verified</p>
                  )}
                  {faceSimilarity != null && (
                    <p>
                      Your live photo{" "}
                      {faceIsMatch
                        ? "matches"
                        : faceSimilarity >= 0.5
                          ? "partially matches"
                          : "does not closely match"}{" "}
                      the face on your document
                      {livenessPct != null ? ` (${Math.round(faceSimilarity * 100)}%)` : ""}.
                    </p>
                  )}
                  <p className="text-[#94A3B8]">Submitting your application…</p>
                </div>
              )}
            </div>
          )}

          {captures.front && (
            <div className="grid grid-cols-3 gap-2">
              {["front", "left", "right"].map((key) => (
                <div key={key} className="overflow-hidden rounded-xl bg-[#E2E8F0]">
                  {captures[key] ? (
                    <img
                      src={captures[key]}
                      alt={`${key} capture`}
                      className="aspect-square w-full object-cover"
                    />
                  ) : (
                    <div className="flex aspect-square items-center justify-center text-[10px] font-semibold uppercase text-[#94A3B8]">
                      {key}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
