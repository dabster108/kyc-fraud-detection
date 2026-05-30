"""Forgery detection service using ELA and multiple CV/metadata checks.

Weighted pipeline:
1. ELA (Error Level Analysis)         47 %  — JPEG re-compression artifacts (most reliable)
2. EXIF Metadata Anomaly              20 %  — editing-software / stripped metadata
3. Edge Inconsistency                  5 %  — unnatural edge distribution (low-reliability for ID docs)
4. Font / Text Consistency            10 %  — glyph-size variance via connected comps
5. Noise Pattern                      10 %  — pasted-region noise mismatch
6. Copy-Move Detection                 8 %  — ORB keypoint clone detection

Calibration notes:
- Edge inconsistency weight lowered (15% → 10%): citizenship/ID cards have naturally
  high edge variance because they mix photo zones, text blocks, seals and borders.
  Raw std-deviation of edge densities will always be large for legitimate documents.
- Font consistency threshold raised (CV 0.30 → 0.55): ID documents intentionally use
  different font sizes for field labels (small), values (medium) and titles (large).
  The old threshold penalised this normal design pattern.
- Copy-move weight lowered (15% → 8%): ORB keypoints create false positives on
  documents with repetitive patterns (watermarks, decorative borders, seals).
"""

from __future__ import annotations

import asyncio
import logging
from io import BytesIO
from time import perf_counter
from typing import Dict, List, Tuple

import cv2
import numpy as np
from PIL import Image, ImageChops
from PIL.ExifTags import TAGS

from app.models.ocr_models import ForgeryResult

logger = logging.getLogger(__name__)

# ──────────────────────────────────────────────
# Software names that strongly indicate editing
# ──────────────────────────────────────────────
_EDITING_SOFTWARE: Tuple[str, ...] = (
    "photoshop",
    "gimp",
    "lightroom",
    "affinity",
    "paint",
    "illustrator",
    "inkscape",
    "canva",
    "pixelmator",
    "capture one",
    "darktable",
    "rawtherapee",
)

_CAMERA_SOFTWARE: Tuple[str, ...] = (
    "camera",
    "canon",
    "nikon",
    "sony",
    "samsung",
    "apple",
    "google",
    "huawei",
    "xiaomi",
    "oppo",
    "vivo",
)


# ──────────────────────────────────────────────
# CHECK 4 — EXIF metadata analysis
# ──────────────────────────────────────────────

def _check_exif(image_bytes: bytes) -> Tuple[float, Dict]:
    """Return an EXIF anomaly score (0-100) and debug detail dict.

    Scoring:
    - 80 pts if known editing software is found in the Software tag.
    - 20 pts if DateTimeOriginal is absent (common in re-saved/forged images).
    - 20 pts if Software is present but is not any known camera/OS software.
    - 30 pts if EXIF is completely absent on a JPEG (stripped during editing).
    PNG images that naturally lack EXIF are given a mild 10-pt flag only.
    """
    detail: Dict = {}
    try:
        img = Image.open(BytesIO(image_bytes))
        img_format = (img.format or "").upper()
        exif = img.getexif()  # Empty Exif object when no tags present
    except Exception as exc:
        detail["exif_error"] = str(exc)
        return 0.0, detail

    tag_data = {TAGS.get(k, k): v for k, v in exif.items()}
    detail["exif_tag_count"] = len(tag_data)
    detail["image_format"] = img_format

    score = 0.0

    # Completely empty EXIF
    if not tag_data:
        if img_format == "JPEG":
            score += 30.0
            detail["exif_stripped"] = True
        else:
            # PNG / WEBP — missing EXIF is normal
            score += 10.0
            detail["exif_stripped"] = False
        return min(score, 100.0), detail

    # Software tag
    software = str(tag_data.get("Software", "")).strip().lower()
    detail["software"] = software or None

    if software:
        if any(ed in software for ed in _EDITING_SOFTWARE):
            score += 80.0
            detail["editing_software_detected"] = True
        elif not any(cs in software for cs in _CAMERA_SOFTWARE):
            # Software present but not a known camera/OS vendor
            score += 20.0
            detail["unknown_software"] = True

    # DateTimeOriginal absence
    if "DateTimeOriginal" not in tag_data:
        score += 20.0
        detail["missing_datetime_original"] = True

    # No camera make/model at all
    if "Make" not in tag_data and "Model" not in tag_data:
        score += 10.0
        detail["missing_camera_info"] = True

    return min(score, 100.0), detail


# ──────────────────────────────────────────────
# CHECK 5 — Copy-move clone detection (ORB)
# ──────────────────────────────────────────────

def _check_copy_move(gray: np.ndarray) -> Tuple[float, Dict]:
    """Return a copy-move score (0-100) and debug detail dict.

    Uses ORB keypoints matched against themselves.  A second-best match
    (not the self-match) with low descriptor distance yet large spatial
    separation is a strong signal that a region was copy-pasted.
    """
    detail: Dict = {}
    try:
        orb = cv2.ORB_create(nfeatures=1000)
        keypoints, descriptors = orb.detectAndCompute(gray, None)

        if descriptors is None or len(keypoints) < 20:
            detail["keypoints_found"] = len(keypoints) if keypoints else 0
            detail["skipped"] = "too few keypoints"
            return 0.0, detail

        detail["keypoints_found"] = len(keypoints)

        bf = cv2.BFMatcher(cv2.NORM_HAMMING)
        # k=2: first match is always self (distance=0), second is nearest other
        matches = bf.knnMatch(descriptors, descriptors, k=2)

        suspicious = 0
        for pair in matches:
            if len(pair) < 2:
                continue
            _, second = pair  # pair[0] is self-match
            if second.distance > 35:
                continue
            pt1 = keypoints[second.queryIdx].pt
            pt2 = keypoints[second.trainIdx].pt
            spatial_dist = np.hypot(pt1[0] - pt2[0], pt1[1] - pt2[1])
            if spatial_dist > 60:
                suspicious += 1

        detail["suspicious_matches"] = suspicious
        ratio = suspicious / max(len(keypoints), 1)
        detail["suspicious_ratio"] = round(ratio, 4)
        score = min(ratio * 300, 100.0)
        return score, detail

    except Exception as exc:
        detail["copy_move_error"] = str(exc)
        return 0.0, detail


# ──────────────────────────────────────────────
# CHECK 6 — Font / text consistency
# ──────────────────────────────────────────────

def _check_font_consistency(gray: np.ndarray) -> Tuple[float, Dict]:
    """Return a font-consistency anomaly score (0-100) and debug detail dict.

    Uses connected-component analysis to extract glyph-sized blobs (individual
    characters).  A high coefficient-of-variation in character heights across
    the document signals that text regions have different font sizes — a common
    artefact when a name or number is pasted in from another source.

    Genuine documents typically have CV ~0.20-0.45 (label text is smaller than
    field values).  A forged field pushed the CV above ~0.55.
    """
    detail: Dict = {}
    try:
        # Adaptive threshold isolates dark text on light background
        binary = cv2.adaptiveThreshold(
            gray, 255,
            cv2.ADAPTIVE_THRESH_GAUSSIAN_C,
            cv2.THRESH_BINARY_INV,
            11, 2,
        )

        num_labels, _, stats, _ = cv2.connectedComponentsWithStats(
            binary, connectivity=8
        )

        char_heights: List[int] = []
        char_widths: List[int] = []

        for i in range(1, num_labels):  # label 0 = background
            h = int(stats[i, cv2.CC_STAT_HEIGHT])
            w = int(stats[i, cv2.CC_STAT_WIDTH])
            area = int(stats[i, cv2.CC_STAT_AREA])
            # Keep only character-sized blobs; skip noise dots and large regions
            if 5 < h < 80 and 3 < w < 80 and area > 15:
                char_heights.append(h)
                char_widths.append(w)

        detail["char_blobs"] = len(char_heights)

        if len(char_heights) < 10:
            detail["skipped"] = "too few character blobs"
            return 0.0, detail

        heights = np.array(char_heights, dtype=float)
        mean_h = float(np.mean(heights))
        std_h = float(np.std(heights))
        cv_h = std_h / (mean_h + 1e-6)

        detail["mean_char_height"] = round(mean_h, 2)
        detail["std_char_height"] = round(std_h, 2)
        detail["height_cv"] = round(cv_h, 4)

        # CV below 0.30 → consistent (genuine), above 0.70 → very inconsistent
        # Threshold raised from 0.30 → 0.55: ID documents intentionally mix font sizes
        # (small field labels, medium values, large title) so a CV of ~0.50 is normal.
        score = max(0.0, (cv_h - 0.55) / 0.35) * 100
        return min(score, 100.0), detail

    except Exception as exc:
        detail["font_check_error"] = str(exc)
        return 0.0, detail


# ──────────────────────────────────────────────
# Main synchronous analysis pipeline
# ──────────────────────────────────────────────

def _sync_analyze(image_bytes: bytes) -> Tuple[
    float,         # forgery_score
    str,           # decision
    List[List[int]], # suspicious_regions
    float,         # edge_consistency_score
    float,         # noise_score
    float,         # exif_anomaly_score
    float,         # copy_move_score
    float,         # font_consistency_score
    dict,          # details
]:
    """Full synchronous forgery analysis pipeline (run in executor)."""

    # ── CHECK 1: ELA ───────────────────────────────────────────────────────
    original_pil = Image.open(BytesIO(image_bytes)).convert("RGB")

    buffer = BytesIO()
    original_pil.save(buffer, format="JPEG", quality=90)
    buffer.seek(0)
    resaved_pil = Image.open(buffer).convert("RGB")

    diff = ImageChops.difference(original_pil, resaved_pil)
    amplified = diff.point(lambda p: min(p * 10, 255))
    amplified_np = np.array(amplified)
    ela_mean_brightness = float(np.mean(amplified_np))
    ela_score = min((ela_mean_brightness / 255) * 100 * 3, 100.0)

    # Suspicious high-ELA regions
    gray_amplified = cv2.cvtColor(amplified_np, cv2.COLOR_RGB2GRAY)
    _, thresh = cv2.threshold(gray_amplified, 128, 255, cv2.THRESH_BINARY)
    contours, _ = cv2.findContours(thresh, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    suspicious_regions: List[List[int]] = []
    for contour in contours:
        if cv2.contourArea(contour) > 500:
            x, y, w, h = cv2.boundingRect(contour)
            suspicious_regions.append([int(x), int(y), int(w), int(h)])

    # ── CHECK 2: Edge Consistency ──────────────────────────────────────────
    original_np = np.array(original_pil)
    gray = cv2.cvtColor(original_np, cv2.COLOR_RGB2GRAY)
    edges = cv2.Canny(gray, 100, 200)

    img_h, img_w = edges.shape
    grid_h, grid_w = max(img_h // 4, 1), max(img_w // 4, 1)
    edge_densities = [
        int(np.count_nonzero(
            edges[i * grid_h:(i + 1) * grid_h, j * grid_w:(j + 1) * grid_w]
        ))
        for i in range(4) for j in range(4)
    ]
    edge_std = float(np.std(edge_densities))
    edge_inconsistency_score = min(edge_std * 2, 100.0)

    # ── CHECK 3: Noise Pattern ─────────────────────────────────────────────
    blurred = cv2.GaussianBlur(gray, (5, 5), 0)
    noise = cv2.subtract(gray, blurred)
    noise_std = float(np.std(noise))

    if noise_std > 15:
        noise_score = min(noise_std * 2, 100.0)
    elif noise_std < 1:
        noise_score = 50.0
    else:
        noise_score = 0.0

    # ── CHECK 4: EXIF metadata ─────────────────────────────────────────────
    exif_score, exif_detail = _check_exif(image_bytes)

    # ── CHECK 5: Copy-move ─────────────────────────────────────────────────
    copy_move_score, copy_move_detail = _check_copy_move(gray)

    # ── CHECK 6: Font consistency ──────────────────────────────────────────
    font_score, font_detail = _check_font_consistency(gray)

    # ── COMBINE: weighted composite ───────────────────────────────────────
    # Weights: ELA 47% · EXIF 20% · Edge 5% · Font 10% · Noise 10% · CopyMove 8%
    # Edge weight reduced 15% → 10% → 5%: ID cards always score 100 on this signal
    # (photo + text + seal + border = naturally extreme edge variance). Not reliable alone.
    # ELA receives the freed weight (42% → 47%): most trustworthy signal for JPEG edits.
    forgery_score = (
        ela_score              * 0.47
        + edge_inconsistency_score * 0.05
        + noise_score          * 0.10
        + exif_score           * 0.20
        + copy_move_score      * 0.08
        + font_score           * 0.10
    )

    if forgery_score < 35:
        decision = "genuine"
    elif forgery_score < 71:
        decision = "suspicious"
    else:
        decision = "forged"

    details: dict = {
        # ELA
        "ela_score": round(ela_score, 2),
        "ela_mean_brightness": round(ela_mean_brightness, 2),
        # Edge
        "edge_inconsistency_score": round(edge_inconsistency_score, 2),
        # Noise
        "noise_score": round(noise_score, 2),
        "noise_std": round(noise_std, 2),
        # EXIF
        "exif_anomaly_score": round(exif_score, 2),
        "exif": exif_detail,
        # Copy-move
        "copy_move_score": round(copy_move_score, 2),
        "copy_move": copy_move_detail,
        # Font
        "font_consistency_score": round(font_score, 2),
        "font": font_detail,
        # Regions
        "suspicious_region_count": len(suspicious_regions),
    }

    return (
        forgery_score,
        decision,
        suspicious_regions,
        edge_inconsistency_score,
        noise_score,
        exif_score,
        copy_move_score,
        font_score,
        details,
    )


async def analyze_forgery(image_bytes: bytes) -> ForgeryResult:
    """Analyze an image for forgery using six weighted forensic checks.

    All CPU-bound work is dispatched to the default thread executor so the
    event loop is never blocked.

    Args:
        image_bytes: Raw image bytes (JPEG / PNG / WEBP).

    Returns:
        :class:`ForgeryResult` with composite score, decision, and per-check
        detail values.
    """
    start_time = perf_counter()

    loop = asyncio.get_event_loop()
    (
        forgery_score,
        decision,
        suspicious_regions,
        edge_consistency_score,
        noise_score,
        exif_anomaly_score,
        copy_move_score,
        font_consistency_score,
        details,
    ) = await loop.run_in_executor(None, _sync_analyze, image_bytes)

    processing_time_ms = int((perf_counter() - start_time) * 1000)

    return ForgeryResult(
        forgery_score=forgery_score,
        decision=decision,
        suspicious_regions=suspicious_regions,
        edge_consistency_score=edge_consistency_score,
        noise_score=noise_score,
        exif_anomaly_score=exif_anomaly_score,
        copy_move_score=copy_move_score,
        font_consistency_score=font_consistency_score,
        processing_time_ms=processing_time_ms,
        details=details,
    )
