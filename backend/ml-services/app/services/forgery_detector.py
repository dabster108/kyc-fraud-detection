"""Forgery detection service using Error Level Analysis (ELA) and CV checks.

Implements a multi-check forgery detection pipeline:
1. ELA (Error Level Analysis) - 50% weight
2. Edge Consistency - 30% weight
3. Noise Pattern Analysis - 20% weight
"""

from __future__ import annotations

import asyncio
import logging
from io import BytesIO
from time import perf_counter
from typing import List, Tuple

import cv2
import numpy as np
from PIL import Image, ImageChops

from app.models.ocr_models import ForgeryResult

logger = logging.getLogger(__name__)


def _sync_analyze(image_bytes: bytes) -> Tuple[
    float,  # forgery_score
    str,  # decision
    List[List[int]],  # suspicious_regions
    float,  # edge_consistency_score
    float,  # noise_score
    dict,  # details
]:
    """Synchronous forgery analysis pipeline (to be run in executor).

    Returns a tuple of all components needed to construct ForgeryResult.
    """
    # CHECK 1: ELA (Error Level Analysis) - 50% weight
    original_pil = Image.open(BytesIO(image_bytes)).convert("RGB")

    # Re-save at JPEG quality=90
    buffer = BytesIO()
    original_pil.save(buffer, format="JPEG", quality=90)
    buffer.seek(0)
    resaved_pil = Image.open(buffer).convert("RGB")

    # Compute difference
    diff = ImageChops.difference(original_pil, resaved_pil)

    # Amplify differences × 10
    amplified = diff.point(lambda p: min(p * 10, 255))

    # Convert to numpy for analysis
    amplified_np = np.array(amplified)
    ela_mean_brightness = np.mean(amplified_np)

    # ELA score: normalize and scale
    ela_score = min((ela_mean_brightness / 255) * 100 * 3, 100.0)

    # Find suspicious regions
    gray_amplified = cv2.cvtColor(amplified_np, cv2.COLOR_RGB2GRAY)
    _, thresh = cv2.threshold(gray_amplified, 128, 255, cv2.THRESH_BINARY)
    contours, _ = cv2.findContours(
        thresh, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE
    )

    suspicious_regions = []
    for contour in contours:
        area = cv2.contourArea(contour)
        if area > 500:
            x, y, w, h = cv2.boundingRect(contour)
            suspicious_regions.append([int(x), int(y), int(w), int(h)])

    # CHECK 2: Edge Consistency - 30% weight
    original_np = np.array(original_pil)
    gray = cv2.cvtColor(original_np, cv2.COLOR_RGB2GRAY)
    edges = cv2.Canny(gray, 100, 200)

    # Split into 4×4 grid
    h, w = edges.shape
    grid_h, grid_w = h // 4, w // 4
    edge_densities = []

    for i in range(4):
        for j in range(4):
            block = edges[
                i * grid_h : (i + 1) * grid_h, j * grid_w : (j + 1) * grid_w
            ]
            edge_count = np.count_nonzero(block)
            edge_densities.append(edge_count)

    edge_std = np.std(edge_densities)
    edge_inconsistency_score = min(edge_std * 2, 100.0)

    # CHECK 3: Noise Pattern - 20% weight
    blurred = cv2.GaussianBlur(gray, (5, 5), 0)
    noise = cv2.subtract(gray, blurred)
    noise_std = float(np.std(noise))

    if noise_std > 15:
        noise_score = min(noise_std * 2, 100.0)
    elif noise_std < 1:
        noise_score = 50.0
    else:
        noise_score = 0.0

    # COMBINE SCORES
    forgery_score = (
        ela_score * 0.50 + edge_inconsistency_score * 0.30 + noise_score * 0.20
    )

    # Determine decision
    if forgery_score < 35:
        decision = "genuine"
    elif forgery_score < 71:
        decision = "suspicious"
    else:
        decision = "forged"

    # Build details dict
    details = {
        "ela_score": float(ela_score),
        "ela_mean_brightness": float(ela_mean_brightness),
        "edge_inconsistency_score": float(edge_inconsistency_score),
        "noise_score": float(noise_score),
        "noise_std": float(noise_std),
        "suspicious_region_count": len(suspicious_regions),
    }

    return (
        forgery_score,
        decision,
        suspicious_regions,
        edge_inconsistency_score,
        noise_score,
        details,
    )


async def analyze_forgery(image_bytes: bytes) -> ForgeryResult:
    """Analyze an image for forgery using ELA and CV checks.

    Runs all CV/PIL operations in an executor to avoid blocking the event loop.

    Args:
        image_bytes: Raw image bytes (JPEG/PNG/WEBP).

    Returns:
        ForgeryResult with score, decision, and analysis details.
    """
    start_time = perf_counter()

    loop = asyncio.get_event_loop()
    (
        forgery_score,
        decision,
        suspicious_regions,
        edge_consistency_score,
        noise_score,
        details,
    ) = await loop.run_in_executor(None, _sync_analyze, image_bytes)

    processing_time_ms = int((perf_counter() - start_time) * 1000)

    return ForgeryResult(
        forgery_score=forgery_score,
        decision=decision,
        suspicious_regions=suspicious_regions,
        edge_consistency_score=edge_consistency_score,
        noise_score=noise_score,
        processing_time_ms=processing_time_ms,
        details=details,
    )
