export const MOVEMENT_THRESHOLD = 8;
export const MIN_BLINKS = 2;
export const MIN_MOVEMENTS = 3;
export const HEAD_TURN_OFFSET = 12;

export function euclidean(p1, p2) {
  return Math.sqrt((p1.x - p2.x) ** 2 + (p1.y - p2.y) ** 2);
}

export function getEAR(eyePoints) {
  const v1 = euclidean(eyePoints[1], eyePoints[5]);
  const v2 = euclidean(eyePoints[2], eyePoints[4]);
  const h = euclidean(eyePoints[0], eyePoints[3]);
  return h === 0 ? 0 : (v1 + v2) / (2.0 * h);
}

export function createBlinkTracker() {
  return {
    blinkCount: 0,
    eyeOpen: true,
    earBaseline: null,
    smoothedEAR: null,
    lastBlinkTime: 0,
    BLINK_RATIO: 0.88,
    BLINK_DROP_RATIO: 0.12,
    BLINK_COOLDOWN_MS: 160,
  };
}

export function updateBlinkTracker(tracker, landmarks) {
  const leftEAR = getEAR(landmarks.slice(36, 42));
  const rightEAR = getEAR(landmarks.slice(42, 48));
  const avgEAR = (leftEAR + rightEAR) / 2;
  const minEAR = Math.min(leftEAR, rightEAR);

  if (tracker.earBaseline === null) {
    tracker.earBaseline = avgEAR;
  } else if (avgEAR > tracker.earBaseline * 0.9) {
    tracker.earBaseline = tracker.earBaseline * 0.85 + avgEAR * 0.15;
  }

  if (tracker.smoothedEAR === null) {
    tracker.smoothedEAR = avgEAR;
  } else {
    tracker.smoothedEAR = tracker.smoothedEAR * 0.55 + avgEAR * 0.45;
  }

  const dynThreshold = tracker.earBaseline * tracker.BLINK_RATIO;
  const dropFromBaseline =
    tracker.earBaseline > 0
      ? (tracker.earBaseline - avgEAR) / tracker.earBaseline
      : 0;

  const eyesClosed =
    avgEAR < dynThreshold ||
    minEAR < tracker.earBaseline * (tracker.BLINK_RATIO - 0.04) ||
    dropFromBaseline >= tracker.BLINK_DROP_RATIO;

  if (eyesClosed) {
    tracker.eyeOpen = false;
  } else if (tracker.eyeOpen === false) {
    const now = Date.now();
    if (now - tracker.lastBlinkTime >= tracker.BLINK_COOLDOWN_MS) {
      tracker.blinkCount += 1;
      tracker.lastBlinkTime = now;
    }
    tracker.eyeOpen = true;
  }

  return tracker.blinkCount;
}

export function createMovementTracker() {
  return {
    movementCount: 0,
    prevNoseX: null,
    lastMovementDirection: null,
  };
}

export function updateMovementTracker(tracker, noseX) {
  if (tracker.prevNoseX !== null) {
    const deltaX = noseX - tracker.prevNoseX;
    if (Math.abs(deltaX) > MOVEMENT_THRESHOLD) {
      const currentDir = deltaX > 0 ? "right" : "left";
      if (currentDir !== tracker.lastMovementDirection) {
        tracker.movementCount += 1;
        tracker.lastMovementDirection = currentDir;
      }
    }
  }
  tracker.prevNoseX = noseX;
  return tracker.movementCount;
}

export function captureVideoFrame(video, mirror = true) {
  const canvas = document.createElement("canvas");
  const width = video.videoWidth || 720;
  const height = video.videoHeight || 720;
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) {
    return null;
  }
  if (mirror) {
    context.translate(width, 0);
    context.scale(-1, 1);
  }
  context.drawImage(video, 0, 0, width, height);
  return canvas.toDataURL("image/jpeg", 0.9);
}
