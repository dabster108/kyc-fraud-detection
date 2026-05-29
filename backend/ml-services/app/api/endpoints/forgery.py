"""Forgery detection API endpoints.

Exposes multipart and base64 upload endpoints backed by the ELA forgery
detection service. Every successful analysis is appended to the configured
``forged.json`` audit log.
"""

from __future__ import annotations

import base64
import binascii
import json
import logging
import os
import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, File, HTTPException, UploadFile, status
from pydantic import BaseModel, Field

from app.core.config import settings
from app.models.ocr_models import ForgeryResult
from app.services.forgery_detector import analyze_forgery

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/forgery", tags=["Forgery"])

# Allowed image content types for multipart uploads.
_ALLOWED_CONTENT_TYPES = {
    "image/jpeg",
    "image/jpg",
    "image/png",
    "image/webp",
}
# Magic-byte signatures used to validate base64 payloads (no content-type).
_IMAGE_SIGNATURES = (
    b"\xff\xd8\xff",  # JPEG
    b"\x89PNG\r\n\x1a\n",  # PNG
    b"RIFF",  # WEBP (RIFF container)
)


class Base64ForgeryRequest(BaseModel):
    """Request body for base64 image forgery detection."""

    base64_image: str = Field(..., description="Base64-encoded image bytes.")


def _max_upload_bytes() -> int:
    """Return the configured maximum upload size in bytes."""
    return settings.MAX_UPLOAD_MB * 1024 * 1024


def _looks_like_image(data: bytes) -> bool:
    """Return True if ``data`` begins with a supported image signature."""
    return any(data.startswith(sig) for sig in _IMAGE_SIGNATURES)


def _append_to_forged_json(result: ForgeryResult) -> None:
    """Append a forgery result entry to ``forged.json`` under an exclusive lock.

    Creates the file with an empty list if it does not exist. Uses ``fcntl``
    advisory locking on POSIX systems to prevent concurrent-write corruption;
    on platforms without ``fcntl`` it degrades gracefully to an unlocked write.

    Note: ``ela_heatmap_b64`` is excluded from the persisted entry as it can
    be large and is only needed in API responses.
    """
    path = settings.FORGED_JSON_PATH
    entry = {
        "id": str(uuid.uuid4()),
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "service": "forgery",
        "forgery_score": result.forgery_score,
        "decision": result.decision,
        "suspicious_regions": result.suspicious_regions,
        "edge_consistency_score": result.edge_consistency_score,
        "noise_score": result.noise_score,
        "processing_time_ms": result.processing_time_ms,
        "details": result.details,
    }

    try:
        import fcntl  # POSIX-only
    except ImportError:  # pragma: no cover - non-POSIX fallback
        fcntl = None  # type: ignore[assignment]

    os.makedirs(os.path.dirname(path) or ".", exist_ok=True)
    if not os.path.exists(path):
        with open(path, "w", encoding="utf-8") as fh:
            json.dump([], fh)

    with open(path, "r+", encoding="utf-8") as fh:
        if fcntl is not None:
            fcntl.flock(fh.fileno(), fcntl.LOCK_EX)
        try:
            raw = fh.read().strip()
            try:
                data = json.loads(raw) if raw else []
                if not isinstance(data, list):
                    data = []
            except json.JSONDecodeError:
                logger.warning("forged.json was corrupt; reinitialising list")
                data = []

            data.append(entry)

            fh.seek(0)
            fh.truncate()
            json.dump(data, fh, ensure_ascii=False, indent=2)
            fh.flush()
            os.fsync(fh.fileno())
        finally:
            if fcntl is not None:
                fcntl.flock(fh.fileno(), fcntl.LOCK_UN)


async def _process_and_store(image_bytes: bytes) -> ForgeryResult:
    """Run forgery detection and persist the result to ``forged.json``."""
    try:
        result = await analyze_forgery(image_bytes)
    except Exception as exc:  # noqa: BLE001 - surface as a 500 with detail
        logger.exception("Forgery detection failed")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Forgery detection failed: {exc}",
        ) from exc

    try:
        _append_to_forged_json(result)
    except Exception:  # noqa: BLE001 - persistence must not fail the request
        logger.exception("Failed to append result to forged.json")

    return result


@router.post("/verify", response_model=ForgeryResult)
async def verify(
    image: UploadFile = File(..., description="Document image for forgery analysis."),
) -> ForgeryResult:
    """Analyze an uploaded image for forgery using ELA and CV checks.

    Validates content type and size, runs forgery detection, persists the result
    to ``forged.json`` and returns a :class:`ForgeryResult`.
    """
    content_type = (image.content_type or "").lower()
    if content_type not in _ALLOWED_CONTENT_TYPES:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid file type. Supported types: jpeg, png, webp.",
        )

    image_bytes = await image.read()
    if not image_bytes:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Uploaded file is empty.",
        )
    if len(image_bytes) > _max_upload_bytes():
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail=f"File exceeds maximum size of {settings.MAX_UPLOAD_MB}MB.",
        )

    return await _process_and_store(image_bytes)


@router.post("/verify-base64", response_model=ForgeryResult)
async def verify_base64(payload: Base64ForgeryRequest) -> ForgeryResult:
    """Analyze a base64-encoded image for forgery using ELA and CV checks.

    Mirrors :func:`verify` but accepts a JSON body containing the base64
    image string instead of a multipart upload.
    """
    raw = payload.base64_image.strip()
    # Strip an optional data URI prefix (e.g. ``data:image/png;base64,``).
    if raw.startswith("data:"):
        _, _, raw = raw.partition(",")

    try:
        image_bytes = base64.b64decode(raw, validate=True)
    except (binascii.Error, ValueError) as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid base64 image data.",
        ) from exc

    if not image_bytes:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Decoded image is empty.",
        )
    if len(image_bytes) > _max_upload_bytes():
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail=f"File exceeds maximum size of {settings.MAX_UPLOAD_MB}MB.",
        )
    if not _looks_like_image(image_bytes):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Decoded data is not a supported image (jpeg/png/webp).",
        )

    return await _process_and_store(image_bytes)
