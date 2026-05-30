"""Face extraction and comparison API endpoints for KYC.

Exposes:
- POST /face/extract     — detect + embed + persist a face from an ID image
- POST /face/compare     — compare a selfie against a stored document embedding
- GET  /face/latest      — most recent face embedding with OCR data
"""

from __future__ import annotations

import asyncio
import logging
from typing import Any, Dict, Optional

import numpy as np
from fastapi import APIRouter, File, Form, HTTPException, UploadFile, status

from app.core.config import settings
from app.database import supabase_client
from app.database.supabase_client import supabase
from app.models.face_models import FaceExtractionResult
from app.services import face_extractor
from app.services.face_extractor import _detect, _to_vector_literal, is_ready as models_ready

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/face", tags=["Face"])

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
    similarity_threshold: Optional[float] = Form(
        default=None,
        description="Cosine similarity threshold for verified-face duplicate detection.",
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
            image_bytes, submission_id, similarity_threshold
        )
    except Exception as exc:  # noqa: BLE001 - safety net; service is resilient
        logger.exception("Face extraction endpoint failed")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Face extraction failed: {exc}",
        ) from exc

    if result.is_duplicate and result.duplicate_match is not None:
        # A verified-user face match is surfaced via the response body so the
        # Express layer can add risk flags.  We intentionally do NOT raise a
        # 409 here — blocking the upload would reveal that a face is known,
        # which leaks information. Risk scoring happens server-side.
        logger.info(
            "Verified-face duplicate detected (similarity=%.3f) for submission %s",
            result.duplicate_match.similarity_score,
            result.submission_id,
        )

    return result


@router.post("/compare")
async def compare_faces(
    selfie_image: UploadFile = File(..., description="Selfie image to compare."),
    submission_id: str = Form(..., description="kyc_submission_id from Step 2 face/extract."),
    match_threshold: Optional[float] = Form(
        default=None,
        description="Minimum cosine similarity to count as a face match.",
    ),
) -> Dict[str, Any]:
    """Compare a live selfie against the stored document face embedding.

    Extracts a 512-d InsightFace embedding from the selfie, then queries
    pgvector for the cosine similarity against the embedding stored under
    ``submission_id`` (produced in Step 2 by ``/face/extract``).

    Returns::

        {
            "face_found":       bool,
            "similarity_score": float | null,   # 0-1, null if no face / no stored emb
            "is_match":         bool,
            "threshold":        float,
            "error":            str | null
        }
    """
    if not models_ready():
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Face models are still loading. Please retry in a few seconds.",
            headers={"Retry-After": "5"},
        )

    content_type = (selfie_image.content_type or "").lower()
    if content_type not in _ALLOWED_CONTENT_TYPES:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid file type. Supported: jpeg, png, webp.",
        )

    image_bytes = await selfie_image.read()
    if not image_bytes or len(image_bytes) > _max_upload_bytes():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Empty or oversized image.",
        )

    threshold = (
        match_threshold
        if match_threshold is not None
        else settings.FACE_MATCH_THRESHOLD
    )

    # ── 1. Extract selfie embedding ──────────────────────────────────────────
    loop = asyncio.get_event_loop()
    try:
        faces, _ = await loop.run_in_executor(None, _detect, image_bytes)
    except Exception as exc:
        return {
            "face_found": False,
            "similarity_score": None,
            "is_match": False,
            "threshold": threshold,
            "error": f"Face detection failed: {exc}",
        }

    if not faces:
        return {
            "face_found": False,
            "similarity_score": None,
            "is_match": False,
            "threshold": threshold,
            "error": "No face detected in selfie.",
        }

    best_face = max(faces, key=lambda f: float(f.det_score))
    selfie_embedding = np.asarray(best_face.embedding, dtype=np.float32)
    vector_literal = _to_vector_literal(selfie_embedding)

    # ── 2. Look up stored document embedding and compute similarity ──────────
    query = """
        SELECT 1 - (embedding <=> $1::vector) AS similarity
        FROM   face_embeddings
        WHERE  submission_id = $2
        ORDER  BY created_at DESC
        LIMIT  1
    """

    similarity: Optional[float] = None

    try:
        pool = await supabase_client.get_pool()
        async with pool.acquire() as conn:
            row = await conn.fetchrow(query, vector_literal, submission_id)
        if row is not None:
            similarity = round(float(row["similarity"]), 4)
    except Exception as exc:
        logger.warning("DB pool failed for face compare; trying Supabase RPC: %s", exc)
        # Fallback: fetch raw embedding via Supabase REST and compute in numpy
        try:
            client = supabase_client.supabase
            if client is not None:
                resp = (
                    client.table("face_embeddings")
                    .select("embedding")
                    .eq("submission_id", submission_id)
                    .order("created_at", desc=True)
                    .limit(1)
                    .execute()
                )
                if resp.data:
                    raw = resp.data[0]["embedding"]
                    # pgvector returns "[v1,v2,...]" string via REST
                    if isinstance(raw, str):
                        doc_vec = np.array(
                            [float(x) for x in raw.strip("[]").split(",")],
                            dtype=np.float32,
                        )
                    else:
                        doc_vec = np.array(raw, dtype=np.float32)
                    dot = float(np.dot(selfie_embedding, doc_vec))
                    norm = float(np.linalg.norm(selfie_embedding) * np.linalg.norm(doc_vec))
                    similarity = round(dot / norm if norm > 0 else 0.0, 4)
        except Exception as fb_exc:
            logger.exception("Face compare fallback also failed: %s", fb_exc)

    if similarity is None:
        return {
            "face_found": True,
            "similarity_score": None,
            "is_match": False,
            "threshold": threshold,
            "error": f"No stored embedding found for submission_id={submission_id}",
        }

    return {
        "face_found": True,
        "similarity_score": similarity,
        "is_match": similarity >= threshold,
        "threshold": threshold,
        "error": None,
    }


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
