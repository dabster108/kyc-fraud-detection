"""Pydantic models for the OCR service responses."""

from __future__ import annotations

from typing import Dict, List, Literal, Optional

from pydantic import BaseModel, Field


class OCRResult(BaseModel):
    """Structured result returned by the Mistral OCR extraction service.

    Attributes:
        document_type: Detected document category.
        extracted_fields: Parsed field name/value pairs from the document.
        raw_text: The raw text/JSON returned by the model (for auditing).
        confidence_score: Heuristic confidence in the extraction (0.0-1.0).
        processing_time_ms: End-to-end processing time in milliseconds.
        photo_region: Bounding box ``[x1, y1, x2, y2]`` of the portrait photo,
            or ``None`` when not applicable.
        thumbnail_region: Bounding box of a secondary thumbnail/signature, or
            ``None`` when not applicable.
    """

    document_type: Literal[
        "citizenship", "nid", "driving_license", "unknown"
    ] = Field(..., description="Detected document type.")
    extracted_fields: Dict = Field(
        default_factory=dict,
        description="Structured fields parsed from the document.",
    )
    raw_text: str = Field(
        default="", description="Raw model response, kept for auditing."
    )
    confidence_score: float = Field(
        default=0.0, ge=0.0, le=1.0, description="Extraction confidence."
    )
    processing_time_ms: int = Field(
        default=0, description="End-to-end processing time in milliseconds."
    )
    photo_region: Optional[List[int]] = Field(
        default=None, description="Portrait photo bounding box [x1,y1,x2,y2]."
    )
    thumbnail_region: Optional[List[int]] = Field(
        default=None, description="Secondary thumbnail bounding box."
    )


class ForgeryResult(BaseModel):
    """Structured result returned by the forgery detection service.

    Attributes:
        forgery_score: Weighted composite forgery score (0-100).
        decision: Classification based on score thresholds.
        suspicious_regions: List of bounding boxes for suspicious areas.
        edge_consistency_score: Score from edge consistency analysis (0-100).
        noise_score: Score from noise pattern analysis (0-100).
        exif_anomaly_score: Score from EXIF metadata analysis (0-100).
            High value means editing software detected or metadata stripped.
        copy_move_score: Score from copy-move clone detection (0-100).
            High value means copy-pasted regions found inside the image.
        font_consistency_score: Score from text glyph size analysis (0-100).
            High value means inconsistent character sizes across the document.
        processing_time_ms: End-to-end processing time in milliseconds.
        details: Per-check raw values for debugging.
    """

    forgery_score: float = Field(
        ..., ge=0.0, le=100.0, description="Weighted composite forgery score."
    )
    decision: Literal["genuine", "suspicious", "forged"] = Field(
        ..., description="Classification based on score."
    )
    suspicious_regions: List[List[int]] = Field(
        default_factory=list,
        description="List of bounding boxes [x, y, w, h] for suspicious areas.",
    )
    edge_consistency_score: float = Field(
        default=0.0, ge=0.0, le=100.0, description="Edge consistency score."
    )
    noise_score: float = Field(
        default=0.0, ge=0.0, le=100.0, description="Noise pattern score."
    )
    exif_anomaly_score: float = Field(
        default=0.0, ge=0.0, le=100.0, description="EXIF metadata anomaly score."
    )
    copy_move_score: float = Field(
        default=0.0, ge=0.0, le=100.0, description="Copy-move clone detection score."
    )
    font_consistency_score: float = Field(
        default=0.0, ge=0.0, le=100.0, description="Text glyph size consistency score."
    )
    processing_time_ms: int = Field(
        default=0, description="Processing time in milliseconds."
    )
    details: Dict = Field(
        default_factory=dict, description="Per-check raw values for debugging."
    )
