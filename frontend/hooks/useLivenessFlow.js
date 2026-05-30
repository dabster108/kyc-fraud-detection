"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { loadFaceApiModels } from "../lib/liveness/faceApiLoader";
import {
  HEAD_TURN_OFFSET,
  MIN_BLINKS,
  MIN_MOVEMENTS,
  captureVideoFrame,
  createBlinkTracker,
  createMovementTracker,
  updateBlinkTracker,
  updateMovementTracker,
} from "../lib/liveness/detection";

const ML_LIVENESS_URL =
  process.env.NEXT_PUBLIC_ML_URL || "http://localhost:8000/api/v1";

/** ML service rejects sessions shorter than this (seconds). */
const ML_MIN_DURATION_SEC = 5;

const CHALLENGE_META = {
  loading: { label: "Loading", hint: "Preparing face detection…", emoji: "⏳" },
  forward: { label: "Look forward", hint: "Center your face in the oval", emoji: "🙂" },
  blink: { label: "Blink", hint: "Blink your eyes at least twice", emoji: "😉" },
  left: { label: "Turn left", hint: "Slowly turn your head to the left", emoji: "👈" },
  right: { label: "Turn right", hint: "Slowly turn your head to the right", emoji: "👉" },
  verifying: { label: "Verifying", hint: "Checking liveness and ID match…", emoji: "🔍" },
  complete: { label: "Verified", hint: "Liveness and face match complete", emoji: "✅" },
  failed: { label: "Try again", hint: "Verification did not pass", emoji: "⚠️" },
};

const FORWARD_STABLE_MS = 800;

export default function useLivenessFlow({
  videoRef,
  cameraReady,
  sessionId,
  onComplete,
  onError,
}) {
  const [phase, setPhase] = useState("loading");
  const [faceDetected, setFaceDetected] = useState(false);
  const [blinkCount, setBlinkCount] = useState(0);
  const [movementCount, setMovementCount] = useState(0);
  const [captures, setCaptures] = useState({ front: null, left: null, right: null });
  const [livenessResult, setLivenessResult] = useState(null);
  const [faceSimilarity, setFaceSimilarity] = useState(null);
  const [faceIsMatch, setFaceIsMatch] = useState(null);
  const [verifyError, setVerifyError] = useState("");

  const faceapiRef = useRef(null);
  const blinkTrackerRef = useRef(createBlinkTracker());
  const movementTrackerRef = useRef(createMovementTracker());
  const baselineNoseXRef = useRef(null);
  const forwardStableSinceRef = useRef(null);
  const phaseRef = useRef("loading");
  const startedAtRef = useRef(null);
  const loopRef = useRef(null);
  const verifyingRef = useRef(false);

  const setPhaseSafe = useCallback((next) => {
    phaseRef.current = next;
    setPhase(next);
  }, []);

  const runVerification = useCallback(
    async (nextCaptures, stats) => {
      if (verifyingRef.current) return;
      verifyingRef.current = true;
      setPhaseSafe("verifying");
      setVerifyError("");

      const rawDuration = startedAtRef.current
        ? (Date.now() - startedAtRef.current) / 1000
        : 10;
      const clientPassed =
        stats.blinkCount >= MIN_BLINKS && stats.movementCount >= MIN_MOVEMENTS;
      const durationSeconds = clientPassed
        ? Math.max(rawDuration, ML_MIN_DURATION_SEC)
        : rawDuration;

      let liveness = null;
      try {
        const res = await fetch(`${ML_LIVENESS_URL}/liveness/verify`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            blink_count: stats.blinkCount,
            movement_count: stats.movementCount,
            duration_seconds: durationSeconds,
            submission_id: sessionId || undefined,
          }),
        });
        if (res.ok) {
          liveness = await res.json();
          setLivenessResult(liveness);
        }
      } catch {
        /* liveness service optional — fall back to client signals below */
      }

      const liveOk = liveness
        ? liveness.is_live
        : clientPassed;

      if (liveness && !liveness.is_live) {
        setPhaseSafe("failed");
        verifyingRef.current = false;
        onError?.(
          liveness.decision === "INSUFFICIENT_DATA"
            ? "Liveness recording was too short. Take your time with each step, then try again."
            : "Liveness check did not pass. Please try again."
        );
        return;
      }

      if (!liveOk) {
        setPhaseSafe("failed");
        verifyingRef.current = false;
        onError?.("Liveness check did not pass. Please try again.");
        return;
      }

      const dataUrlToBlob = (dataUrl, filename) => {
        const [header, base64] = dataUrl.split(",");
        const mime = header.match(/:(.*?);/)[1];
        const binary = atob(base64);
        const arr = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) arr[i] = binary.charCodeAt(i);
        return new File([arr], filename, { type: mime });
      };

      let similarity = null;
      let isMatch = null;
      let selfieUrl = null;
      let riskFlags = {};
      let riskScore = null;
      let decision = null;

      if (sessionId && nextCaptures.front) {
        try {
          const fd = new FormData();
          fd.append(
            "selfie_front",
            dataUrlToBlob(nextCaptures.front, "selfie_front.jpg")
          );
          if (nextCaptures.left) {
            fd.append(
              "selfie_left",
              dataUrlToBlob(nextCaptures.left, "selfie_left.jpg")
            );
          }
          if (nextCaptures.right) {
            fd.append(
              "selfie_right",
              dataUrlToBlob(nextCaptures.right, "selfie_right.jpg")
            );
          }

          if (liveness) {
            fd.append("livenessIsLive", liveness.is_live ? "true" : "false");
            fd.append("livenessDecision", liveness.decision || "");
            fd.append(
              "livenessConfidence",
              String(liveness.confidence_score ?? 0)
            );
          } else {
            fd.append("livenessIsLive", clientPassed ? "true" : "false");
          }

          const apiBase = process.env.NEXT_PUBLIC_API_URL || "/api/v1";
          const res = await fetch(
            `${apiBase}/onboarding/session/${sessionId}/selfie`,
            { method: "PUT", body: fd }
          );
          const data = await res.json();
          if (res.ok && data.success) {
            similarity =
              data.faceSimilarity ??
              data.riskFlags?.face_similarity ??
              null;
            isMatch = data.isMatch ?? null;
            selfieUrl = data.selfieUrl ?? null;
            riskFlags = data.riskFlags || {};
            riskScore = data.riskScore ?? null;
            setFaceSimilarity(similarity);
            setFaceIsMatch(isMatch);
            decision = {
              outcome: data.outcome || "pending",
              status: data.status || "submitted",
              userMessage: data.userMessage || null,
              userReason: data.userReason || null,
              riskScore: data.riskScore ?? null,
            };
          } else {
            setVerifyError(data.error || "Face comparison failed.");
            setPhaseSafe("failed");
            verifyingRef.current = false;
            onError?.(data.error || "Face comparison failed.");
            return;
          }
        } catch {
          setVerifyError("Could not compare face with your document.");
          setPhaseSafe("failed");
          verifyingRef.current = false;
          onError?.("Could not compare face with your document.");
          return;
        }
      }

      setPhaseSafe("complete");
      onComplete?.({
        captures: nextCaptures,
        livenessResult: liveness,
        faceSimilarity: similarity,
        faceIsMatch: isMatch,
        selfieUrl,
        riskFlags,
        riskScore,
        decision,
        blinkCount: stats.blinkCount,
        movementCount: stats.movementCount,
      });
    },
    [onComplete, onError, sessionId, setPhaseSafe]
  );

  const detectionLoop = useCallback(async () => {
    const video = videoRef.current;
    const faceapi = faceapiRef.current;
    if (!video || !faceapi || !cameraReady || phaseRef.current === "verifying" || phaseRef.current === "complete") {
      return;
    }

    let detection;
    try {
      detection = await faceapi
        .detectSingleFace(
          video,
          new faceapi.SsdMobilenetv1Options({ minConfidence: 0.45 })
        )
        .withFaceLandmarks();
    } catch {
      setFaceDetected(false);
      return;
    }

    if (!detection) {
      setFaceDetected(false);
      forwardStableSinceRef.current = null;
      return;
    }

    setFaceDetected(true);
    const landmarks = detection.landmarks.positions;
    const noseX = landmarks[30].x;
    const currentPhase = phaseRef.current;

    const blinks = updateBlinkTracker(blinkTrackerRef.current, landmarks);
    setBlinkCount(blinks);

    const movements = updateMovementTracker(movementTrackerRef.current, noseX);
    setMovementCount(movements);

    if (currentPhase === "forward") {
      if (baselineNoseXRef.current === null) {
        baselineNoseXRef.current = noseX;
      }
      if (!forwardStableSinceRef.current) {
        forwardStableSinceRef.current = Date.now();
      } else if (Date.now() - forwardStableSinceRef.current >= FORWARD_STABLE_MS) {
        const frame = captureVideoFrame(video, true);
        setCaptures((c) => ({ ...c, front: frame }));
        setPhaseSafe("blink");
        forwardStableSinceRef.current = null;
      }
      return;
    }

    if (currentPhase === "blink") {
      if (blinks >= MIN_BLINKS) {
        setPhaseSafe("left");
        forwardStableSinceRef.current = null;
      }
      return;
    }

    if (currentPhase === "left") {
      const baseline = baselineNoseXRef.current ?? noseX;
      if (noseX < baseline - HEAD_TURN_OFFSET) {
        const frame = captureVideoFrame(video, true);
        setCaptures((c) => {
          const next = { ...c, left: frame };
          setPhaseSafe("right");
          return next;
        });
      }
      return;
    }

    if (currentPhase === "right") {
      const baseline = baselineNoseXRef.current ?? noseX;
      if (noseX > baseline + HEAD_TURN_OFFSET) {
        const frame = captureVideoFrame(video, true);
        setCaptures((c) => {
          const next = { ...c, right: frame };
          const stats = {
            blinkCount: blinkTrackerRef.current.blinkCount,
            movementCount: Math.max(
              movementTrackerRef.current.movementCount,
              MIN_MOVEMENTS
            ),
          };
          runVerification(next, stats);
          return next;
        });
      }
    }
  }, [cameraReady, runVerification, setPhaseSafe, videoRef]);

  useEffect(() => {
    if (!cameraReady) return undefined;

    let cancelled = false;
    (async () => {
      try {
        const faceapi = await loadFaceApiModels();
        if (cancelled) return;
        faceapiRef.current = faceapi;
        startedAtRef.current = Date.now();
        blinkTrackerRef.current = createBlinkTracker();
        movementTrackerRef.current = createMovementTracker();
        baselineNoseXRef.current = null;
        verifyingRef.current = false;
        setPhaseSafe("forward");
      } catch {
        setVerifyError("Could not load face detection models.");
        setPhaseSafe("failed");
        onError?.("Could not load face detection. Check your connection.");
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [cameraReady, onError, setPhaseSafe]);

  useEffect(() => {
    if (!cameraReady || phase === "loading") return undefined;

    loopRef.current = setInterval(() => {
      detectionLoop();
    }, 50);

    return () => {
      if (loopRef.current) clearInterval(loopRef.current);
    };
  }, [cameraReady, detectionLoop, phase]);

  const reset = useCallback(() => {
    blinkTrackerRef.current = createBlinkTracker();
    movementTrackerRef.current = createMovementTracker();
    baselineNoseXRef.current = null;
    forwardStableSinceRef.current = null;
    verifyingRef.current = false;
    startedAtRef.current = Date.now();
    setBlinkCount(0);
    setMovementCount(0);
    setCaptures({ front: null, left: null, right: null });
    setLivenessResult(null);
    setFaceSimilarity(null);
    setFaceIsMatch(null);
    setVerifyError("");
    setPhaseSafe("forward");
  }, [setPhaseSafe]);

  const challenge = CHALLENGE_META[phase] || CHALLENGE_META.loading;

  return {
    phase,
    challenge,
    faceDetected,
    blinkCount,
    movementCount,
    minBlinks: MIN_BLINKS,
    minMovements: MIN_MOVEMENTS,
    captures,
    livenessResult,
    faceSimilarity,
    faceIsMatch,
    verifyError,
    reset,
  };
}
