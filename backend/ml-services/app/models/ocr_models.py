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
