"""Face extraction API endpoint for KYC document images.

Exposes a single multipart endpoint that detects the primary face in an
uploaded ID image, stores its embedding, checks for duplicates and returns a
:class:`FaceExtractionResult`.
"""

from __future__ import annotations

import logging
from typing import Any, Dict, Optional

from fastapi import APIRouter, File, Form, HTTPException, UploadFile, status

from app.core.config import settings
from app.database.supabase_client import supabase
from app.models.face_models import FaceExtractionResult
from app.services import face_extractor
from app.services.face_extractor import is_ready as models_ready

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/face", tags=["Face"])

# Allowed image content types for multipart uploads.
_ALLOWED_CONTENT_TYPES = {
    "image/jpeg",
    "image/jpg",
    "image/png",
    "image/webp",
}


def _max_upload_bytes() -> int:
    """Return the configured maximum upload size in bytes."""
    return settings.MAX_UPLOAD_MB * 1024 * 1024


@router.post("/extract", response_model=FaceExtractionResult)
async def extract(
    image: UploadFile = File(..., description="KYC document image."),
    submission_id: Optional[str] = Form(
        default=None, description="Optional existing submission id."
    ),
) -> FaceExtractionResult:
    """Detect and persist the primary face from an uploaded ID image.

    Validates the upload, then delegates to the face extraction service. The
    service itself never raises, so any processing problem is reported via the
    response body rather than an HTTP error. A ``500`` is only returned for
    truly unexpected failures.
    """
    if not models_ready():
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Face models are still loading. Please retry in a few seconds.",
            headers={"Retry-After": "5"},
        )

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

    try:
        result = await face_extractor.extract_and_save_face(
            image_bytes, submission_id
        )
    except Exception as exc:  # noqa: BLE001 - safety net; service is resilient
        logger.exception("Face extraction endpoint failed")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Face extraction failed: {exc}",
        ) from exc

    if result.is_duplicate and result.duplicate_match is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail={
                "error": "duplicate_face_detected",
                "message": "This face already exists in the system.",
                "matched_submission_id": result.duplicate_match.matched_submission_id,
                "similarity_score": result.duplicate_match.similarity_score,
                "matched_at": result.duplicate_match.matched_at,
            },
        )

    return result


@router.get("/latest")
async def get_latest_submission() -> Dict[str, Any]:
    """Return the most recent face embedding with its OCR data."""
    if supabase is None:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Supabase client is not configured.",
        )

    face_resp = (
        supabase.table("face_embeddings")
        .select("*")
        .order("created_at", desc=True)
        .limit(1)
        .execute()
    )

    if not face_resp.data:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No face embeddings found.",
        )

    row = face_resp.data[0]
    submission_id = row.get("submission_id", "")

    extracted_fields: Dict[str, Any] = {}
    document_type = ""

    ocr_resp = (
        supabase.table("ocr_results")
        .select("extracted_fields, document_type")
        .eq("submission_id", submission_id)
        .limit(1)
        .execute()
    )

    if ocr_resp.data:
        ocr_row = ocr_resp.data[0]
        extracted_fields = ocr_row.get("extracted_fields", {})
        document_type = ocr_row.get("document_type", "")

    return {
        "submission_id": submission_id,
        "face_image_url": row.get("face_image_url", ""),
        "id_image_url": row.get("id_image_url", ""),
        "document_type": document_type,
        "extracted_fields": extracted_fields,
    }
