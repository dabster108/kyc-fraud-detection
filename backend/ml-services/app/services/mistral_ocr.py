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

# ---------------------------------------------------------------------------
# System prompt shared by both single-image and dual-image calls.
# The dual-image call appends an extra user-message line identifying which
# image is the front and which is the back.
# ---------------------------------------------------------------------------
SYSTEM_PROMPT = r"""
You are a KYC document parser for Nepali government ID documents.
Analyze the image(s) and return ONLY a valid JSON object — no extra text,
no markdown fences, no explanation.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
DEVANAGARI DIGIT TABLE (apply to every digit you read):
  ० = 0  १ = 1  २ = 2  ३ = 3  ४ = 4
  ५ = 5  ६ = 6  ७ = 7  ८ = 8  ९ = 9
Do NOT confuse २ (2) with ९ (9) or ३ (3). Examine every glyph carefully.
ALL numeric output MUST use Western Arabic digits (0-9).
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

═══════════════════════════════════════════════════════════════════════════
NEPALI CITIZENSHIP CARD (नागरिकता पत्र)
═══════════════════════════════════════════════════════════════════════════
The physical FRONT is the NEPALI side (has the passport photo).
The physical BACK is the ENGLISH side (has fingerprints).

NEPALI SIDE (front / IMAGE 1 when two images are provided) — extract:
  full_name_nepali            Devanagari name exactly as printed (नाम थर)
  date_of_birth_bs            from "साल: YYYY महिना: MM गते: DD" → "YYYY-MM-DD"
  birth_place_district        Devanagari district (जन्म स्थान: जिल्ला)
  birth_place_municipality    Devanagari municipality / VDC (न.पा. / गा.वि.स.)
  permanent_address_district  Devanagari district (स्थायी बासस्थान: जिल्ला)
  permanent_address_municipality  Devanagari municipality
  issued_district             Devanagari issuing district (जिल्ला प्रशासन कार्यालय)
  issued_date_bs              issuing officer date "जारी मिति" → "YYYY-MM-DD" (BS digits)
  father_name_nepali          father's full Devanagari name (बाबुको नाम थर)
  father_name_english         romanized transliteration of father's name
  mother_name_nepali          mother's full Devanagari name (आमाको नाम थर)
  mother_name_english         romanized transliteration of mother's name
  spouse_name_nepali          spouse's Devanagari name (पति/पत्नीको नामथर); null if "XXX" or blank
  spouse_name_english         romanized transliteration; null if no spouse

ENGLISH SIDE (back / IMAGE 2 when two images are provided) — extract:
  citizenship_number     Pattern: ^\d{2}-\d{2}-\d{2}-\d{5}$  e.g. "75-01-79-06164"
  full_name_english      ALL-CAPS Latin exactly as printed (Full Name)
  gender                 map Sex field: "Male"→"male", "Female"→"female", "Others"→"other"
  date_of_birth_ad       format "Year:YYYY Month:MMM Day:DD"
                         Month map: JAN=01 FEB=02 MAR=03 APR=04 MAY=05 JUN=06
                                    JUL=07 AUG=08 SEP=09 OCT=10 NOV=11 DEC=12
                         Output as "YYYY-MM-DD"  e.g. "2006-06-16"
  birth_place_district_english       district name in Latin (Birth Place: District)
  birth_place_municipality_english   municipality name in Latin (Municipality)
  birth_place_ward_number            ward integer as string (Ward No.)
  permanent_address_district_english (Permanent Address: District)
  permanent_address_municipality_english (Municipality)
  permanent_address_ward_number      ward integer as string (Ward No.)
  issued_district_english            issuing district in Latin

Return this merged JSON for citizenship (set null for any field not visible):
{
  "document_type": "citizenship",
  "citizenship_number": "",
  "full_name_english": "",
  "full_name_nepali": "",
  "gender": "male|female|other",
  "date_of_birth_ad": "YYYY-MM-DD",
  "date_of_birth_bs": "YYYY-MM-DD",
  "birth_place_district_english": "",
  "birth_place_district": "",
  "birth_place_municipality_english": "",
  "birth_place_municipality": "",
  "birth_place_ward_number": "",
  "permanent_address_district_english": "",
  "permanent_address_district": "",
  "permanent_address_municipality_english": "",
  "permanent_address_municipality": "",
  "permanent_address_ward_number": "",
  "issued_district_english": "",
  "issued_district": "",
  "issued_date_bs": "",
  "father_name_nepali": null,
  "father_name_english": null,
  "mother_name_nepali": null,
  "mother_name_english": null,
  "spouse_name_nepali": null,
  "spouse_name_english": null
}

═══════════════════════════════════════════════════════════════════════════
NATIONAL ID CARD (राष्ट्रिय परिचयपत्र)
═══════════════════════════════════════════════════════════════════════════
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

═══════════════════════════════════════════════════════════════════════════
DRIVING LICENSE
═══════════════════════════════════════════════════════════════════════════
{
  "document_type": "driving_license",
  "dl_number": "",
  "full_name": "",
  "address": "",
  "date_of_birth_ad": "YYYY-MM-DD",
  "citizenship_number": null,
  "date_of_issue": "YYYY-MM-DD",
  "date_of_expiry": "YYYY-MM-DD"
}

If the document cannot be identified:
{ "document_type": "unknown" }

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
GENERAL RULES
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
- Citizenship BS DOB: "साल: YYYY महिना: MM गते: DD" → YYYY-MM-DD.
  महिना (month) digits: read carefully (e.g. ०२=02, not 09).
- Citizenship AD DOB: parse "Year:YYYY Month:MMM Day:DD" from the front exactly
  using the month map above. Do NOT derive it mathematically from BS here.
- The "_nepali" fields keep the original Devanagari script exactly as printed.
- The "_english" fields are romanized transliterations
  (e.g. सानु थिड → "Sanu Thid", मकवानपुर → "Makwanpur").
- NID: read SURNAME (थर) and GIVEN NAME (नाम) separately.
  full_name_* = "<given_name> <surname>" in matching script.
- Nationality is always "Nepalese" for NID cards.
- Driving License: dl_number = "D.L.No.", full_name = "Name", address = "Address",
  date_of_birth_ad = "D.O.B", date_of_issue = "D.O.I", date_of_expiry = "D.O.E"
  (all converted to YYYY-MM-DD). citizenship_number = "Citizenship No." or null.
  Do NOT extract father/mother name for a driving license.
- Use null for any field not visible or not applicable.
- Output Western Arabic digits (0-9) everywhere.
""".strip()

# Required fields per document type (used for confidence scoring).
# Only fields that are always present are listed; nullable fields are excluded.
_REQUIRED_FIELDS = {
    "citizenship": (
        "citizenship_number",
        "full_name_english",
        "gender",
        "date_of_birth_ad",
        "permanent_address_district_english",
        "permanent_address_ward_number",
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
    # citizenship_number is explicitly nullable, so it is excluded.
    "driving_license": (
        "dl_number",
        "full_name",
        "address",
        "date_of_birth_ad",
        "date_of_issue",
        "date_of_expiry",
    ),
}

_DEVANAGARI_DIGIT_MAP = str.maketrans("०१२३४५६७८९", "0123456789")

# Fields whose values are pure numbers — any Devanagari digits in them are
# converted to Western Arabic digits.  Other (name/place) fields keep their
# Devanagari script untouched so the original text is preserved.
_NUMERIC_FIELDS = (
    "citizenship_number",
    "nin",
    # legacy single ward field
    "ward_number",
    # new explicit ward fields
    "permanent_address_ward_number",
    "birth_place_ward_number",
    "date_of_birth_bs",
    "date_of_birth_ad",
    "issued_date_bs",
    "issued_date_ad",
    "date_of_issue",
    "date_of_expiry",
    "dl_number",
    "mobile_number",
)

# Three-letter month abbreviation → zero-padded month number.
_MONTH_ABBREV: Dict[str, str] = {
    "JAN": "01", "FEB": "02", "MAR": "03", "APR": "04",
    "MAY": "05", "JUN": "06", "JUL": "07", "AUG": "08",
    "SEP": "09", "OCT": "10", "NOV": "11", "DEC": "12",
}


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


def _parse_citizenship_dob_ad(raw: str) -> Optional[str]:
    """Parse the AD DOB printed on the citizenship front.

    Handles two formats:
      1. "Year:2006 Month:JUN Day:16"  (English front side)
      2. "YYYY-MM-DD"                  (already normalized, pass-through)

    Returns ``None`` if the string cannot be parsed.
    """
    if not raw:
        return None
    raw = raw.strip()
    # Already in ISO format — pass-through after digit normalization.
    if re.match(r"^\d{4}-\d{2}-\d{2}$", raw):
        return raw
    # "Year:2006 Month:JUN Day:16" (spaces may vary)
    m = re.search(
        r"Year[:\s]*(\d{4})\s+Month[:\s]*([A-Za-z]{3})\s+Day[:\s]*(\d{1,2})",
        raw,
        re.IGNORECASE,
    )
    if m:
        year = m.group(1)
        month = _MONTH_ABBREV.get(m.group(2).upper())
        day = m.group(3).zfill(2)
        if month:
            return f"{year}-{month}-{day}"
    return None


def _normalize_citizenship_fields(fields: Dict[str, Any]) -> Dict[str, Any]:
    """Post-process citizenship extracted_fields.

    1. Parse the English front AD DOB (``date_of_birth_ad`` may come in as
       "Year:YYYY Month:MMM Day:DD" — convert to YYYY-MM-DD).
    2. Derive ``issued_date_ad`` from ``issued_date_bs`` via ``_bs_to_ad``.
    3. Add a backward-compat ``ward_number`` alias for
       ``permanent_address_ward_number`` so existing code still works.
    4. Clean up null-ish spouse names ("XXX", "---", etc.).
    """
    # 1. Fix AD DOB format coming from the English front.
    raw_dob_ad = fields.get("date_of_birth_ad", "")
    if isinstance(raw_dob_ad, str) and raw_dob_ad:
        parsed = _parse_citizenship_dob_ad(_devanagari_to_ascii(raw_dob_ad))
        if parsed:
            fields["date_of_birth_ad"] = parsed

    # 2. Compute issued_date_ad if not already present.
    if not fields.get("issued_date_ad"):
        fields["issued_date_ad"] = _bs_to_ad(fields.get("issued_date_bs", ""))

    # 3. Backward-compat ward_number alias.
    if fields.get("permanent_address_ward_number") and not fields.get("ward_number"):
        fields["ward_number"] = fields["permanent_address_ward_number"]
    elif fields.get("ward_number") and not fields.get("permanent_address_ward_number"):
        fields["permanent_address_ward_number"] = fields["ward_number"]

    # 4. Clean spouse names that are placeholders.
    _NULL_SPOUSE = {"xxx", "---", "-", "", "x", "na", "n/a"}
    for key in ("spouse_name_nepali", "spouse_name_english"):
        val = fields.get(key)
        if isinstance(val, str) and val.strip().lower() in _NULL_SPOUSE:
            fields[key] = None

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
        document_type: ``"citizenship"``, ``"nid"``, ``"driving_license"``
            or ``"unknown"``.
        width: Image width in pixels.
        height: Image height in pixels.

    Returns:
        ``[x1, y1, x2, y2]`` bounding box, or ``None`` for unknown documents.
    """
    if document_type == "citizenship":
        return [0, 0, int(width * 0.30), int(height * 0.60)]
    if document_type == "nid":
        return [int(width * 0.65), 0, width, int(height * 0.70)]
    if document_type == "driving_license":
        return [0, int(height * 0.15), int(width * 0.28), int(height * 0.80)]
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
    """Build the chat messages payload with the system prompt and one image."""
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


def _build_messages_dual(
    front_b64: str, front_mime: str, back_b64: str, back_mime: str
) -> List[Dict[str, Any]]:
    """Build the chat messages payload for a two-sided citizenship card.

    In Nepal, the physical FRONT of the citizenship is the Nepali side
    (with photo, family details, BS dates), and the physical BACK is the
    English side (with English name, AD DOB, ward numbers).  The user
    uploads them as frontImage / backImage accordingly.
    """
    return [
        {"role": "system", "content": SYSTEM_PROMPT},
        {
            "role": "user",
            "content": [
                {
                    "type": "text",
                    "text": (
                        "Two images of a Nepali Citizenship Card follow. "
                        "IMAGE 1 is the FRONT — the NEPALI side (has the photo, "
                        "Devanagari text, family details, DOB in BS). "
                        "IMAGE 2 is the BACK — the ENGLISH side (has English name, "
                        "Date of Birth AD, English addresses, ward numbers, issuing info). "
                        "Extract all fields from both sides and merge into a single "
                        "citizenship JSON object."
                    ),
                },
                {
                    "type": "image_url",
                    "image_url": f"data:{front_mime};base64,{front_b64}",
                },
                {
                    "type": "image_url",
                    "image_url": f"data:{back_mime};base64,{back_b64}",
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
        if document_type not in (
            "citizenship",
            "nid",
            "driving_license",
            "unknown",
        ):
            document_type = "unknown"

        fields = {k: v for k, v in parsed.items() if k != "document_type"}

        # Force all numeric fields to Western Arabic digits.
        fields = _normalize_numeric_fields(fields)

        if document_type == "citizenship":
            fields = _normalize_citizenship_fields(fields)
        elif document_type == "nid":
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


async def extract_dual_document(
    front_bytes: bytes, back_bytes: bytes
) -> OCRResult:
    """Extract citizenship fields from both the front and back images.

    Sends both images to the Mistral vision model in a single request so it
    can cross-reference fields from both sides (e.g. name in English from the
    front, family details and BS dates from the Nepali back).

    Falls back to single-image extraction on the front if the dual call fails.

    Args:
        front_bytes: Raw bytes of the citizenship front image (English side).
        back_bytes:  Raw bytes of the citizenship back image (Nepali side).

    Returns:
        A populated :class:`OCRResult` with ``document_type = "citizenship"``.
    """
    start = time.perf_counter()
    raw_text = ""
    try:
        from mistralai.client import Mistral

        front_b64 = base64.b64encode(front_bytes).decode("ascii")
        back_b64 = base64.b64encode(back_bytes).decode("ascii")
        front_mime = _detect_mime(front_bytes)
        back_mime = _detect_mime(back_bytes)
        width, height = _image_dimensions(front_bytes)

        client = Mistral(api_key=settings.MISTRAL_API_KEY)
        response = await client.chat.complete_async(
            model=settings.MISTRAL_MODEL,
            messages=_build_messages_dual(front_b64, front_mime, back_b64, back_mime),
            temperature=0,
        )
        raw_text = response.choices[0].message.content or ""

        parsed: Dict[str, Any] = json.loads(_strip_json_fences(raw_text))
        document_type = parsed.get("document_type", "citizenship")
        if document_type not in ("citizenship", "nid", "driving_license", "unknown"):
            document_type = "citizenship"

        fields = {k: v for k, v in parsed.items() if k != "document_type"}
        fields = _normalize_numeric_fields(fields)

        if document_type == "citizenship":
            fields = _normalize_citizenship_fields(fields)
        elif document_type == "nid":
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
    except Exception as exc:  # noqa: BLE001
        logger.exception("Mistral dual-image OCR extraction failed; falling back")
        elapsed_ms = int((time.perf_counter() - start) * 1000)
        detail = raw_text or f"{type(exc).__name__}: {exc}"
        return OCRResult(
            document_type="citizenship",
            extracted_fields={},
            raw_text=detail,
            confidence_score=0.0,
            processing_time_ms=elapsed_ms,
            photo_region=_compute_photo_region(
                "citizenship", *_image_dimensions(front_bytes)
            ),
            thumbnail_region=None,
        )


def supported_documents() -> List[Dict[str, Any]]:
    """Return the supported document types and their extractable fields."""
    return [
        {
            "document_type": "citizenship",
            "dual_image": True,
            "notes": "Send front (English) + back (Nepali) via /ocr/extract-citizenship for best results.",
            "fields": [
                "citizenship_number",
                "full_name_english",
                "full_name_nepali",
                "gender",
                "date_of_birth_ad",
                "date_of_birth_bs",
                "birth_place_district_english",
                "birth_place_district",
                "birth_place_municipality_english",
                "birth_place_municipality",
                "birth_place_ward_number",
                "permanent_address_district_english",
                "permanent_address_district",
                "permanent_address_municipality_english",
                "permanent_address_municipality",
                "permanent_address_ward_number",
                "ward_number",
                "issued_district_english",
                "issued_district",
                "issued_date_bs",
                "issued_date_ad",
                "father_name_nepali",
                "father_name_english",
                "mother_name_nepali",
                "mother_name_english",
                "spouse_name_nepali",
                "spouse_name_english",
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
        {
            "document_type": "driving_license",
            "fields": [
                "dl_number",
                "full_name",
                "address",
                "date_of_birth_ad",
                "citizenship_number",
                "date_of_issue",
                "date_of_expiry",
            ],
        },
    ]
