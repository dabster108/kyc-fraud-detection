"""Liveness detection API endpoint for KYC.

Receives aggregated client-side signals (blink count, head-movement count and
recording duration) and applies threshold rules to decide whether the captured
session represents a live person or a spoof attempt.

Exposes:
- POST /liveness/verify — evaluate liveness signals and optionally persist.
"""

from __future__ import annotations

import logging
from typing import Literal, Optional

from fastapi import APIRouter
from pydantic import BaseModel, Field

from app.database.supabase_client import supabase

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/liveness", tags=["Liveness"])

# Threshold rules. A session is considered live only when it clears the minimum
# blink and movement counts within a sufficiently long recording window.
MIN_BLINKS = 2
MIN_MOVEMENTS = 3
MIN_DURATION = 5.0  # seconds


class LivenessRequest(BaseModel):
    """Aggregated liveness signals submitted by the client."""

    blink_count: int = Field(..., ge=0, description="Number of blinks detected.")
    movement_count: int = Field(
        ..., ge=0, description="Number of distinct head-movement direction changes."
    )
    duration_seconds: float = Field(
        ..., ge=0, description="Length of the recording window in seconds."
    )
    submission_id: Optional[str] = Field(
        default=None, description="Optional KYC submission id to persist against."
    )


class LivenessResult(BaseModel):
    """Outcome of the liveness evaluation."""

    is_live: bool
    decision: Literal["LIVE", "SPOOF", "INSUFFICIENT_DATA"]
    blink_count: int
    movement_count: int
    blink_threshold: int
    movement_threshold: int
    duration_seconds: float
    confidence_score: float
    details: dict
    submission_id: Optional[str] = None


@router.post("/verify", response_model=LivenessResult)
async def verify_liveness(payload: LivenessRequest) -> LivenessResult:
    """Evaluate liveness signals and return a decision.

    The rules are intentionally simple and deterministic:

    - Sessions shorter than ``MIN_DURATION`` cannot be trusted and yield
      ``INSUFFICIENT_DATA``.
    - Passing both blink and movement thresholds yields ``LIVE`` with a
      confidence score weighted equally between the two signals.
    - Passing only one threshold is treated as a likely ``SPOOF`` with low
      confidence; passing neither is a clear ``SPOOF``.

    When a ``submission_id`` is supplied and Supabase is configured, the result
    is persisted to the ``liveness_results`` table on a best-effort basis.
    """
    blink_count = payload.blink_count
    movement_count = payload.movement_count
    duration_seconds = payload.duration_seconds

    if duration_seconds < MIN_DURATION:
        decision: Literal["LIVE", "SPOOF", "INSUFFICIENT_DATA"] = "INSUFFICIENT_DATA"
        is_live = False
        confidence_score = 0.0
    elif blink_count >= MIN_BLINKS and movement_count >= MIN_MOVEMENTS:
        decision = "LIVE"
        is_live = True
        blink_score = min(blink_count / MIN_BLINKS, 1.0) * 50
        movement_score = min(movement_count / MIN_MOVEMENTS, 1.0) * 50
        confidence_score = round((blink_score + movement_score) / 100, 2)
    elif blink_count >= MIN_BLINKS or movement_count >= MIN_MOVEMENTS:
        decision = "SPOOF"
        is_live = False
        confidence_score = 0.3
    else:
        decision = "SPOOF"
        is_live = False
        confidence_score = 0.0

    details = {
        "blink_passed": blink_count >= MIN_BLINKS,
        "movement_passed": movement_count >= MIN_MOVEMENTS,
        "duration_passed": duration_seconds >= MIN_DURATION,
        "blink_score": blink_count,
        "movement_score": movement_count,
    }

    if payload.submission_id and supabase is not None:
        try:
            supabase.table("liveness_results").insert(
                {
                    "submission_id": payload.submission_id,
                    "is_live": is_live,
                    "decision": decision,
                    "blink_count": blink_count,
                    "movement_count": movement_count,
                    "confidence_score": confidence_score,
                    "duration_seconds": duration_seconds,
                }
            ).execute()
        except Exception:  # noqa: BLE001 - persistence must never block the result
            logger.exception(
                "Failed to persist liveness result for submission_id=%s",
                payload.submission_id,
            )

    return LivenessResult(
        is_live=is_live,
        decision=decision,
        blink_count=blink_count,
        movement_count=movement_count,
        blink_threshold=MIN_BLINKS,
        movement_threshold=MIN_MOVEMENTS,
        duration_seconds=duration_seconds,
        confidence_score=confidence_score,
        details=details,
        submission_id=payload.submission_id,
    )
