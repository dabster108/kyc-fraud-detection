"""Pydantic models for the face extraction service responses."""

from __future__ import annotations

from pydantic import BaseModel, Field


class FaceRegion(BaseModel):
    """Bounding box of a detected face within the source image.

    Coordinates are pixel offsets; ``width``/``height`` are derived from the
    bounding box for convenience.
    """

    x1: int = Field(..., description="Left edge of the face bounding box.")
    y1: int = Field(..., description="Top edge of the face bounding box.")
    x2: int = Field(..., description="Right edge of the face bounding box.")
    y2: int = Field(..., description="Bottom edge of the face bounding box.")
    width: int = Field(..., description="Bounding box width in pixels.")
    height: int = Field(..., description="Bounding box height in pixels.")


class DuplicateMatch(BaseModel):
    """Details of a previously stored face that matches the current one."""

    matched_submission_id: str = Field(
        ..., description="Submission id of the matching face."
    )
    similarity_score: float = Field(
        ..., description="Cosine similarity (0-1) to the matched face."
    )
    matched_at: str = Field(
        ..., description="Creation timestamp of the matched embedding."
    )


class FaceExtractionResult(BaseModel):
    """Structured result returned by the face extraction service."""

    success: bool = Field(
        ..., description="Whether the request completed without a fatal error."
    )
    submission_id: str = Field(
        ..., description="Submission id linking all KYC records."
    )
    face_found: bool = Field(
        ..., description="Whether a face was detected in the image."
    )
    detection_confidence: float | None = Field(
        default=None, description="Detection score of the chosen face."
    )
    face_region: FaceRegion | None = Field(
        default=None, description="Bounding box of the chosen face."
    )
    is_duplicate: bool = Field(
        default=False, description="Whether the face matches a stored face."
    )
    duplicate_match: DuplicateMatch | None = Field(
        default=None, description="Details of the duplicate match, if any."
    )
    id_image_url: str | None = Field(
        default=None, description="Cloudinary URL of the original ID image."
    )
    face_image_url: str | None = Field(
        default=None, description="Cloudinary URL of the cropped face image."
    )
    embedding_saved: bool = Field(
        default=False, description="Whether the embedding was persisted."
    )
    processing_time_ms: int = Field(
        default=0, description="End-to-end processing time in milliseconds."
    )
    error: str | None = Field(
        default=None, description="Error message when something failed."
    )
