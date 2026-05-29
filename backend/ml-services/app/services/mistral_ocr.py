"""Mistral-powered OCR service for Nepali KYC documents.

Sends the document image to a Mistral vision chat model with a strict
system prompt that returns a structured JSON object, then post-processes the
result (photo-region geometry, BS->AD date conversion, confidence scoring).

Note:
    The Mistral ``mistral-ocr-latest`` model is the pure-OCR endpoint and is
    **not** compatible with the chat/system-prompt JSON extraction used here.
    A vision-capable chat model is required (configured via
    ``settings.MISTRAL_MODEL``, default ``pixtral-12b-2409``).
"""

from __future__ import annotations

import base64
import io
import json
import logging
import re
import time
from typing import Any, Dict, List, Optional, Tuple

from PIL import Image

from app.core.config import settings
from app.models.ocr_models import OCRResult

logger = logging.getLogger(__name__)

# Exact system prompt that instructs the model to emit a single JSON object.
SYSTEM_PROMPT = """
You are a KYC document parser for Nepali government ID documents.
Analyze the image and return ONLY a valid JSON object with absolutely no extra text,
no markdown, no code blocks, no explanation.

DEVANAGARI DIGIT REFERENCE (read every number using this table exactly):
  ० = 0    १ = 1    २ = 2    ३ = 3    ४ = 4
  ५ = 5    ६ = 6    ७ = 7    ८ = 8    ९ = 9
Do NOT confuse २ (2) with ९ (9) or ३ (3); look at each glyph carefully.
ALL numeric output (citizenship_number, nin, dates, ward_number) MUST use
Western Arabic digits (0-9), never Devanagari digits.

If document is Nepali Citizenship Card (नागरिकता पत्र) return:
{
  "document_type": "citizenship",
  "citizenship_number": "",
  "full_name_nepali": "",
  "full_name_english": "",
  "gender": "male|female|other",
  "date_of_birth_bs": "YYYY-MM-DD",
  "date_of_birth_ad": "YYYY-MM-DD",
  "birth_place_district": "",
  "birth_place_district_english": "",
  "birth_place_vdc": "",
  "birth_place_vdc_english": "",
  "permanent_address_district": "",
  "permanent_address_district_english": "",
  "permanent_address_municipality": "",
  "permanent_address_municipality_english": "",
  "ward_number": "",
  "issued_district": "",
  "issued_district_english": ""
}

If document is Nepali National ID Card (राष्ट्रिय परिचयपत्र) return:
{
  "document_type": "nid",
  "nin": "",
  "surname_nepali": "",
  "surname_english": "",
  "given_name_nepali": "",
  "given_name_english": "",
  "full_name_nepali": "",
  "full_name_english": "",
  "gender": "male|female",
  "date_of_birth_ad": "YYYY-MM-DD",
  "date_of_birth_bs": "YYYY-MM-DD",
  "nationality": "Nepalese",
  "date_of_issue": "DD-MM-YYYY",
  "mobile_number": null
}

If document cannot be identified return:
{
  "document_type": "unknown"
}

Rules:
- Read the citizenship date of birth from the line "साल XXXX महिना XX गते XX"
  where साल = year, महिना = month, गते = day. Convert to YYYY-MM-DD.
  Read the महिना (month) digits especially carefully (e.g. ०२ = 02, not 09).
- For citizenship date_of_birth_ad: subtract 57 from the BS year if BS month
  <= 9, else subtract 56. Keep the same month and day.
- For gender on citizenship: पुरुष=male, महिला=female, अन्य=other.
- The "_nepali" fields keep the original Devanagari script exactly as printed.
- The "_english" fields are the romanized (transliterated) Latin spelling of
  the corresponding Devanagari value (e.g. सानु थिड -> "Sanu Thing",
  मकवानपुर -> "Makwanpur", हेटौंडा -> "Hetauda", पदमपोखरी -> "Padampokhari").
- For NID, read the SURNAME (थर) and GIVEN NAME (नाम) fields separately.
  surname_* is the surname/family name, given_name_* is the given name(s).
  full_name_* MUST be the given name followed by the surname
  (i.e. "<given_name> <surname>"), in the matching script.
- nationality is always "Nepalese" for NID.
- Use Western Arabic digits (0-9) for every number.
- Use null for any field that is not visible or not applicable.
""".strip()

# Required fields per document type (used for confidence scoring).
_REQUIRED_FIELDS = {
    "citizenship": (
        "citizenship_number",
        "full_name_nepali",
        "full_name_english",
        "gender",
        "date_of_birth_bs",
        "date_of_birth_ad",
        "birth_place_district",
        "permanent_address_district",
        "ward_number",
        "issued_district",
    ),
    # mobile_number is explicitly nullable, so it is excluded.
    "nid": (
        "nin",
        "surname_nepali",
        "surname_english",
        "given_name_nepali",
        "given_name_english",
        "full_name_nepali",
        "full_name_english",
        "gender",
        "date_of_birth_ad",
        "date_of_birth_bs",
        "nationality",
        "date_of_issue",
    ),
}

_DEVANAGARI_DIGIT_MAP = str.maketrans("०१२३४५६७८९", "0123456789")

# Fields whose values are pure numbers — any Devanagari digits in them are
# converted to Western Arabic digits.  Other (name/place) fields keep their
# Devanagari script untouched so the original text is preserved.
_NUMERIC_FIELDS = (
    "citizenship_number",
    "nin",
    "ward_number",
    "date_of_birth_bs",
    "date_of_birth_ad",
    "date_of_issue",
    "mobile_number",
)


def _devanagari_to_ascii(text: str) -> str:
    """Transliterate Devanagari digits (०-९) to ASCII digits (0-9)."""
    return text.translate(_DEVANAGARI_DIGIT_MAP)


def _normalize_numeric_fields(fields: Dict[str, Any]) -> Dict[str, Any]:
    """Convert Devanagari digits to Western Arabic in all numeric fields.

    The model is instructed to emit Western digits, but this guarantees it
    deterministically (e.g. ``"३१-०१-७६-०८११९"`` -> ``"31-01-76-08119"``,
    ``"१२"`` -> ``"12"``).  Non-numeric fields are left unchanged.
    """
    for key in _NUMERIC_FIELDS:
        value = fields.get(key)
        if isinstance(value, str) and value:
            fields[key] = _devanagari_to_ascii(value)
    return fields


def _compose_nid_full_name(fields: Dict[str, Any]) -> Dict[str, Any]:
    """Ensure NID ``full_name_*`` is ``"<given name> <surname>"``.

    Recomputes the combined name from the separate ``given_name_*`` and
    ``surname_*`` fields when both are available, so the full name always
    reflects the given-name-then-surname ordering.
    """
    for script in ("nepali", "english"):
        given = (fields.get(f"given_name_{script}") or "").strip()
        surname = (fields.get(f"surname_{script}") or "").strip()
        if given or surname:
            fields[f"full_name_{script}"] = f"{given} {surname}".strip()
    return fields


def _strip_json_fences(text: str) -> str:
    """Remove markdown code fences and surrounding noise from a JSON string.

    Models sometimes wrap JSON in ```json ... ``` despite instructions; this
    extracts the first balanced ``{...}`` block found in ``text``.
    """
    cleaned = text.strip()
    # Drop ```json / ``` fences if present.
    cleaned = re.sub(r"^```(?:json)?\s*", "", cleaned)
    cleaned = re.sub(r"\s*```$", "", cleaned)
    # Fall back to the outermost brace span.
    start = cleaned.find("{")
    end = cleaned.rfind("}")
    if start != -1 and end != -1 and end > start:
        return cleaned[start : end + 1]
    return cleaned


def _bs_to_ad(date_bs: str) -> Optional[str]:
    """Approximate AD date from a BS date string using the project rule.

    The conversion subtracts 57 years if the BS month is <= 9, otherwise 56,
    keeping the month and day unchanged.  Devanagari digits are normalised
    first.  Returns ``None`` if the input cannot be parsed.

    Args:
        date_bs: BS date in ``YYYY-MM-DD`` form (ASCII or Devanagari digits).

    Returns:
        AD date as ``YYYY-MM-DD`` or ``None``.
    """
    if not date_bs:
        return None
    ascii_bs = _devanagari_to_ascii(str(date_bs))
    match = re.search(r"(\d{4})\D+(\d{1,2})\D+(\d{1,2})", ascii_bs)
    if not match:
        return None
    year, month, day = (int(g) for g in match.groups())
    ad_year = year - 57 if month <= 9 else year - 56
    return f"{ad_year:04d}-{month:02d}-{day:02d}"


def _compute_photo_region(
    document_type: str, width: int, height: int
) -> Optional[List[int]]:
    """Compute the hardcoded portrait photo region for a document type.

    Args:
        document_type: ``"citizenship"``, ``"nid"`` or ``"unknown"``.
        width: Image width in pixels.
        height: Image height in pixels.

    Returns:
        ``[x1, y1, x2, y2]`` bounding box, or ``None`` for unknown documents.
    """
    if document_type == "citizenship":
        return [0, 0, int(width * 0.30), int(height * 0.60)]
    if document_type == "nid":
        return [int(width * 0.65), 0, width, int(height * 0.70)]
    return None


def _score_confidence(document_type: str, fields: Dict[str, Any]) -> float:
    """Score extraction confidence based on completeness of required fields."""
    if document_type not in _REQUIRED_FIELDS:
        return 0.10
    required = _REQUIRED_FIELDS[document_type]
    all_present = all(
        fields.get(key) not in (None, "", []) for key in required
    )
    return 0.90 if all_present else 0.65


def _image_dimensions(image_bytes: bytes) -> Tuple[int, int]:
    """Return ``(width, height)`` of an image given its raw bytes."""
    with Image.open(io.BytesIO(image_bytes)) as img:
        return img.width, img.height


def _build_messages(image_b64: str, mime: str) -> List[Dict[str, Any]]:
    """Build the chat messages payload with the system prompt and image."""
    return [
        {"role": "system", "content": SYSTEM_PROMPT},
        {
            "role": "user",
            "content": [
                {"type": "text", "text": "Parse this Nepali ID document."},
                {
                    "type": "image_url",
                    "image_url": f"data:{mime};base64,{image_b64}",
                },
            ],
        },
    ]


def _detect_mime(image_bytes: bytes) -> str:
    """Best-effort MIME type detection from image magic bytes."""
    if image_bytes.startswith(b"\xff\xd8\xff"):
        return "image/jpeg"
    if image_bytes.startswith(b"\x89PNG\r\n\x1a\n"):
        return "image/png"
    if image_bytes.startswith(b"RIFF") and image_bytes[8:12] == b"WEBP":
        return "image/webp"
    return "image/jpeg"


async def extract_document(image_bytes: bytes) -> OCRResult:
    """Extract structured KYC fields from a document image using Mistral.

    The pipeline base64-encodes the image, measures its dimensions, calls the
    Mistral vision chat model with a strict JSON system prompt, parses the
    response, computes the portrait photo region, fills the AD date of birth
    for citizenship cards, and scores confidence.

    Any failure is captured and returned as an ``unknown`` result with the
    error message in ``raw_text`` and ``confidence_score`` of ``0.0`` — this
    function does not raise.

    Args:
        image_bytes: Raw image content (jpeg/png/webp) as bytes.

    Returns:
        A populated :class:`OCRResult`.
    """
    start = time.perf_counter()
    raw_text = ""
    try:
        # Lazy import keeps app startup fast and avoids import errors leaking.
        from mistralai.client import Mistral

        image_b64 = base64.b64encode(image_bytes).decode("ascii")
        width, height = _image_dimensions(image_bytes)
        mime = _detect_mime(image_bytes)

        client = Mistral(api_key=settings.MISTRAL_API_KEY)
        response = await client.chat.complete_async(
            model=settings.MISTRAL_MODEL,
            messages=_build_messages(image_b64, mime),
            temperature=0,
        )
        raw_text = response.choices[0].message.content or ""

        parsed: Dict[str, Any] = json.loads(_strip_json_fences(raw_text))
        document_type = parsed.get("document_type", "unknown")
        if document_type not in ("citizenship", "nid", "unknown"):
            document_type = "unknown"

        fields = {k: v for k, v in parsed.items() if k != "document_type"}

        # Force all numeric fields to Western Arabic digits.
        fields = _normalize_numeric_fields(fields)

        # Deterministically (re)compute the AD date of birth for citizenship
        # cards from the BS date using the project rule.
        if document_type == "citizenship":
            ad = _bs_to_ad(fields.get("date_of_birth_bs", ""))
            if ad:
                fields["date_of_birth_ad"] = ad

        # For NID, guarantee full_name = "<given name> <surname>" in both
        # scripts even if the model left the combined field blank.
        if document_type == "nid":
            fields = _compose_nid_full_name(fields)

        photo_region = _compute_photo_region(document_type, width, height)
        confidence = (
            _score_confidence(document_type, fields)
            if document_type != "unknown"
            else 0.10
        )

        elapsed_ms = int((time.perf_counter() - start) * 1000)
        return OCRResult(
            document_type=document_type,
            extracted_fields=fields,
            raw_text=raw_text,
            confidence_score=confidence,
            processing_time_ms=elapsed_ms,
            photo_region=photo_region,
            thumbnail_region=None,
        )
    except Exception as exc:  # noqa: BLE001 - never raise; return unknown
        logger.exception("Mistral OCR extraction failed")
        elapsed_ms = int((time.perf_counter() - start) * 1000)
        detail = raw_text or f"{type(exc).__name__}: {exc}"
        return OCRResult(
            document_type="unknown",
            extracted_fields={},
            raw_text=detail,
            confidence_score=0.0,
            processing_time_ms=elapsed_ms,
            photo_region=None,
            thumbnail_region=None,
        )


def supported_documents() -> List[Dict[str, Any]]:
    """Return the supported document types and their extractable fields."""
    return [
        {
            "document_type": "citizenship",
            "fields": [
                "citizenship_number",
                "full_name_nepali",
                "full_name_english",
                "gender",
                "date_of_birth_bs",
                "date_of_birth_ad",
                "birth_place_district",
                "birth_place_district_english",
                "birth_place_vdc",
                "birth_place_vdc_english",
                "permanent_address_district",
                "permanent_address_district_english",
                "permanent_address_municipality",
                "permanent_address_municipality_english",
                "ward_number",
                "issued_district",
                "issued_district_english",
            ],
        },
        {
            "document_type": "nid",
            "fields": [
                "nin",
                "surname_nepali",
                "surname_english",
                "given_name_nepali",
                "given_name_english",
                "full_name_nepali",
                "full_name_english",
                "gender",
                "date_of_birth_ad",
                "date_of_birth_bs",
                "nationality",
                "date_of_issue",
                "mobile_number",
            ],
        },
    ]
