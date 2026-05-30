"""Face extraction, embedding, duplicate detection and persistence service.

Pipeline (all heavy/synchronous work is dispatched to the default executor):
1. Upload the original ID image to Cloudinary.
2. Detect faces with InsightFace (``buffalo_l``).
3. Pick the highest-confidence face, crop it (with padding) and upload it.
4. Look for near-duplicate faces via pgvector cosine similarity.
5. Persist the submission and the face embedding to Supabase.

The InsightFace model is initialised once at module import as a singleton.
Every failure mode is caught so the public coroutine never raises; problems are
reported through :class:`FaceExtractionResult` fields instead.
"""

from __future__ import annotations

import asyncio
import logging
import uuid
from time import perf_counter
from typing import List, Optional, Tuple

import re
import cv2
import numpy as np
from insightface.app import FaceAnalysis

_UUID_RE = re.compile(
    r"^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$",
    re.IGNORECASE,
)

from app.core.config import settings
from app.models.face_models import (
    DuplicateMatch,
    FaceExtractionResult,
    FaceRegion,
)
from app.services import cloudinary_service
from app.database import supabase_client

logger = logging.getLogger(__name__)

# Singleton — populated lazily via load_models().
face_app: Optional[FaceAnalysis] = None
_models_ready = False
_load_lock = __import__("threading").Lock()

# Pixels of padding added around the detected face before cropping.
_CROP_PADDING = 10


def load_models() -> None:
    """Load InsightFace ONNX models into memory (blocking, thread-safe).

    Called from the FastAPI startup hook inside a thread-pool executor so
    the server binds immediately and this heavy work runs in the background.
    The lock ensures the models are only loaded once even if called from
    multiple threads.
    """
    global face_app, _models_ready
    with _load_lock:
        if _models_ready:
            return
        logger.info("Loading InsightFace models (%s)...", settings.FACE_MODEL_NAME)
        t0 = perf_counter()
        _app = FaceAnalysis(
            name=settings.FACE_MODEL_NAME, providers=["CPUExecutionProvider"]
        )
        _app.prepare(ctx_id=-1, det_size=(640, 640))
        # Assign to global only after fully prepared so _detect never sees
        # a half-initialised object.
        face_app = _app
        _models_ready = True
        logger.info("InsightFace models ready in %.1fs", perf_counter() - t0)


def is_ready() -> bool:
    """Return True once the models have finished loading."""
    return _models_ready


def _detect(img_bytes: bytes) -> Tuple[list, Optional[np.ndarray]]:
    """Decode image bytes and run InsightFace detection (sync, for executor)."""
    if face_app is None:
        raise RuntimeError("Face models are still loading. Please retry in a moment.")
    nparr = np.frombuffer(img_bytes, np.uint8)
    img = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
    if img is None:
        return [], None
    faces = face_app.get(img)
    return faces, img


def _crop_encode(
    img: np.ndarray, bbox: List[int]
) -> Optional[bytes]:
    """Crop the face region (with padding) and JPEG-encode it (sync).

    Args:
        img: Decoded BGR image.
        bbox: Face bounding box ``[x1, y1, x2, y2]``.

    Returns:
        JPEG-encoded bytes of the cropped face, or ``None`` on failure.
    """
    height, width = img.shape[:2]
    x1 = max(0, bbox[0] - _CROP_PADDING)
    y1 = max(0, bbox[1] - _CROP_PADDING)
    x2 = min(width, bbox[2] + _CROP_PADDING)
    y2 = min(height, bbox[3] + _CROP_PADDING)

    cropped = img[y1:y2, x1:x2]
    if cropped.size == 0:
        return None

    ok, buffer = cv2.imencode(".jpg", cropped)
    if not ok:
        return None
    return buffer.tobytes()


def _to_vector_literal(embedding: np.ndarray) -> str:
    """Format a numpy embedding as a pgvector text literal ``[v1,v2,...]``.

    This string form is accepted both by ``$1::vector`` casts in raw SQL and
    by Supabase/PostgREST when writing to a ``vector`` column.
    """
    return "[" + ",".join(str(float(v)) for v in embedding.tolist()) + "]"


async def _find_duplicate_via_supabase(
    embedding: np.ndarray,
) -> Optional[DuplicateMatch]:
    """Supabase REST fallback for verified-only duplicate detection via the
    ``match_verified_face_embeddings`` RPC function (see migration 008).

    Used when the asyncpg pool is not available (e.g. ``DATABASE_URL`` not
    set).  Returns ``None`` on any error so the caller can treat it as "no
    duplicate found".
    """
    client = supabase_client.supabase
    if client is None:
        logger.warning("Supabase client not configured; cannot run RPC fallback.")
        return None

    vector_list = embedding.tolist()
    rpc_attempts = (
        (
            "match_verified_face_embeddings",
            {
                "query_embedding": vector_list,
                "similarity_threshold": settings.DUPLICATE_SIMILARITY_THRESHOLD,
                "match_count": 1,
            },
        ),
        (
            "match_face_embeddings",
            {
                "query_embedding": vector_list,
                "similarity_threshold": settings.DUPLICATE_SIMILARITY_THRESHOLD,
                "match_count": 1,
            },
        ),
    )
    rows = None
    for rpc_name, params in rpc_attempts:
        try:
            response = client.rpc(rpc_name, params).execute()
            rows = response.data or []
            break
        except Exception as exc:  # noqa: BLE001
            if rpc_name == "match_verified_face_embeddings":
                logger.warning(
                    "RPC %s unavailable (%s); trying legacy match_face_embeddings",
                    rpc_name,
                    exc,
                )
                continue
            logger.warning("Supabase RPC duplicate detection failed: %s", exc)
            return None

    if not rows:
        return None

    row = rows[0]
    return DuplicateMatch(
        matched_submission_id=str(row["submission_id"]),
        similarity_score=round(float(row["similarity"]), 4),
        matched_at=str(row["created_at"]),
    )


async def _find_duplicate(
    embedding: np.ndarray,
) -> Optional[DuplicateMatch]:
    """Search for the nearest VERIFIED face via pgvector cosine similarity.

    Only checks embeddings where ``is_verified = true`` (i.e. faces of
    already-approved users).  Pending/unverified embeddings are intentionally
    excluded — they are counted separately by ``_count_pending_duplicates``.

    Tries the asyncpg pool first (raw SQL, faster).  Falls back to the
    Supabase REST RPC when the pool is unavailable.  Returns ``None`` when no
    match exceeds the threshold or on any unrecoverable error.
    """
    vector_literal = _to_vector_literal(embedding)
    verified_query = """
        SELECT submission_id, created_at,
          1 - (embedding <=> $1::vector) AS similarity
        FROM face_embeddings
        WHERE is_verified = true
        ORDER BY embedding <=> $1::vector
        LIMIT 1
    """
    legacy_query = """
        SELECT submission_id, created_at,
          1 - (embedding <=> $1::vector) AS similarity
        FROM face_embeddings
        ORDER BY embedding <=> $1::vector
        LIMIT 1
    """
    try:
        pool = await supabase_client.get_pool()
        async with pool.acquire() as conn:
            try:
                row = await conn.fetchrow(verified_query, vector_literal)
            except Exception as exc:  # noqa: BLE001
                if "is_verified" in str(exc):
                    logger.warning(
                        "face_embeddings.is_verified missing — run migration 008; "
                        "using legacy duplicate search"
                    )
                    row = await conn.fetchrow(legacy_query, vector_literal)
                else:
                    raise
    except RuntimeError:
        logger.warning(
            "DB pool unavailable; falling back to Supabase RPC for verified-face detection."
        )
        return await _find_duplicate_via_supabase(embedding)
    except Exception:  # noqa: BLE001 - try the fallback rather than giving up
        logger.warning("asyncpg verified-face detection failed; trying Supabase RPC")
        return await _find_duplicate_via_supabase(embedding)

    if row is None:
        return None

    similarity = float(row["similarity"])
    if similarity > settings.DUPLICATE_SIMILARITY_THRESHOLD:
        return DuplicateMatch(
            matched_submission_id=str(row["submission_id"]),
            similarity_score=round(similarity, 4),
            matched_at=str(row["created_at"]),
        )
    return None


async def _count_pending_duplicates(embedding: np.ndarray) -> int:
    """Count unverified submissions whose face is similar to ``embedding``.

    These are pending sessions that haven't been approved yet.  We do NOT
    block on them — instead the count is returned so the Express risk-scoring
    layer can silently inflate the risk score and surface it only in the admin
    panel.
    """
    vector_literal = _to_vector_literal(embedding)
    verified_query = """
        SELECT COUNT(*) AS cnt
        FROM face_embeddings
        WHERE is_verified = false
          AND (1 - (embedding <=> $1::vector)) > $2
    """
    try:
        pool = await supabase_client.get_pool()
        async with pool.acquire() as conn:
            try:
                row = await conn.fetchrow(
                    verified_query, vector_literal, settings.DUPLICATE_SIMILARITY_THRESHOLD
                )
            except Exception as exc:  # noqa: BLE001
                if "is_verified" in str(exc):
                    logger.warning(
                        "face_embeddings.is_verified missing — pending-face count skipped"
                    )
                    return 0
                raise
        return int(row["cnt"]) if row else 0
    except Exception:  # noqa: BLE001
        logger.warning("asyncpg pending-face count failed; trying Supabase RPC")

    # Supabase RPC fallback
    try:
        client = supabase_client.supabase
        if client is not None:
            for rpc_name in ("count_pending_face_matches",):
                try:
                    resp = client.rpc(
                        rpc_name,
                        {
                            "query_embedding": embedding.tolist(),
                            "similarity_threshold": settings.DUPLICATE_SIMILARITY_THRESHOLD,
                        },
                    ).execute()
                    return int(resp.data) if resp.data is not None else 0
                except Exception as exc:  # noqa: BLE001
                    logger.warning("Supabase RPC %s failed: %s", rpc_name, exc)
    except Exception:  # noqa: BLE001
        logger.warning("Supabase pending-face count unavailable")

    return 0


def _persist_to_supabase(
    submission_id: str,
    embedding: np.ndarray,
    confidence: float,
    bbox: List[int],
    duplicate_match: Optional[DuplicateMatch],
    id_image_url: Optional[str],
    face_image_url: Optional[str],
) -> None:
    """Insert the submission and face embedding into Supabase (sync).

    Raises on failure so the caller can mark ``embedding_saved=False``.
    """
    client = supabase_client.supabase
    if client is None:
        raise RuntimeError("Supabase client not configured")

    client.table("kyc_submissions").insert(
        {
            "id": submission_id,
            "status": "pending",
            "risk_score": 0,
        }
    ).execute()

    client.table("face_embeddings").insert(
        {
            "submission_id": submission_id,
            "embedding": _to_vector_literal(embedding),
            "detection_confidence": confidence,
            "face_region": {
                "x1": int(bbox[0]),
                "y1": int(bbox[1]),
                "x2": int(bbox[2]),
                "y2": int(bbox[3]),
            },
            "is_duplicate": duplicate_match is not None,
            "matched_submission_id": (
                duplicate_match.matched_submission_id
                if duplicate_match is not None
                else None
            ),
            "id_image_url": id_image_url,
            "face_image_url": face_image_url,
        }
    ).execute()


async def extract_and_save_face(
    image_bytes: bytes,
    submission_id: str | None = None,
) -> FaceExtractionResult:
    """Detect, embed, deduplicate and persist a face from an ID image.

    Args:
        image_bytes: Raw bytes of the uploaded ID document image.
        submission_id: Optional caller-provided submission id; generated when
            omitted. Acts as the linking key across all KYC tables.

    Returns:
        A fully populated :class:`FaceExtractionResult`. This coroutine never
        raises: failures are surfaced via the ``success``/``error`` fields.
    """
    start_time = perf_counter()
    # Always generate a fresh UUID when the caller passes nothing, an empty
    # string, or Swagger's default placeholder value "string".
    if not submission_id or not _UUID_RE.match(submission_id):
        submission_id = str(uuid.uuid4())
    loop = asyncio.get_event_loop()

    def _elapsed_ms() -> int:
        return int((perf_counter() - start_time) * 1000)

    try:
        # Step 2: upload original ID image (non-fatal on failure).
        id_image_url: Optional[str] = None
        try:
            id_image_url = await cloudinary_service.upload_image(
                image_bytes,
                folder="kyc/documents",
                public_id=f"doc_{submission_id}",
            )
        except Exception:  # noqa: BLE001 - continue without the URL
            logger.exception("Cloudinary upload of ID image failed")

        # Step 3: detect faces.
        faces, img = await loop.run_in_executor(None, _detect, image_bytes)

        # Step 4: no face found -> early, successful result.
        if not faces or img is None:
            return FaceExtractionResult(
                success=True,
                submission_id=submission_id,
                face_found=False,
                detection_confidence=None,
                face_region=None,
                is_duplicate=False,
                duplicate_match=None,
                id_image_url=id_image_url,
                face_image_url=None,
                embedding_saved=False,
                processing_time_ms=_elapsed_ms(),
                error=None,
            )

        # Step 5: choose the highest-confidence face.
        best_face = max(faces, key=lambda f: float(f.det_score))

        # Step 6: extract bbox, embedding and confidence.
        bbox = [int(v) for v in best_face.bbox.astype(int)]
        embedding = np.asarray(best_face.embedding, dtype=np.float32)
        confidence = float(best_face.det_score)

        face_region = FaceRegion(
            x1=bbox[0],
            y1=bbox[1],
            x2=bbox[2],
            y2=bbox[3],
            width=bbox[2] - bbox[0],
            height=bbox[3] - bbox[1],
        )

        # Steps 7-8: crop face and upload (non-fatal on failure).
        face_image_url: Optional[str] = None
        face_bytes = await loop.run_in_executor(
            None, _crop_encode, img, bbox
        )
        if face_bytes is not None:
            try:
                face_image_url = await cloudinary_service.upload_face_crop(
                    face_bytes, submission_id
                )
            except Exception:  # noqa: BLE001 - continue without the URL
                logger.exception("Cloudinary upload of face crop failed")

        # Step 9: duplicate detection — verified faces only.
        duplicate_match = await _find_duplicate(embedding)
        # Count pending (unverified) near-matches for the silent risk signal.
        pending_duplicate_count = await _count_pending_duplicates(embedding)

        # Steps 10-11: persist submission + embedding (non-fatal on failure).
        embedding_saved = False
        try:
            await loop.run_in_executor(
                None,
                _persist_to_supabase,
                submission_id,
                embedding,
                confidence,
                bbox,
                duplicate_match,
                id_image_url,
                face_image_url,
            )
            embedding_saved = True
        except Exception:  # noqa: BLE001 - persistence failure is non-fatal
            logger.exception("Failed to persist face data to Supabase")

        # Step 12: full result.
        return FaceExtractionResult(
            success=True,
            submission_id=submission_id,
            face_found=True,
            detection_confidence=confidence,
            face_region=face_region,
            is_duplicate=duplicate_match is not None,
            duplicate_match=duplicate_match,
            pending_duplicate_count=pending_duplicate_count,
            id_image_url=id_image_url,
            face_image_url=face_image_url,
            embedding_saved=embedding_saved,
            processing_time_ms=_elapsed_ms(),
            error=None,
        )
    except Exception as exc:  # noqa: BLE001 - never crash the caller
        logger.exception("Unexpected failure during face extraction")
        return FaceExtractionResult(
            success=False,
            submission_id=submission_id,
            face_found=False,
            detection_confidence=None,
            face_region=None,
            is_duplicate=False,
            duplicate_match=None,
            id_image_url=None,
            face_image_url=None,
            embedding_saved=False,
            processing_time_ms=_elapsed_ms(),
            error=str(exc),
        )
