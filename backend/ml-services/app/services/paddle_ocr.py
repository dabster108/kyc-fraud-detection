"""PaddleOCR service for Nepali KYC documents.

Supports automatic detection and structured field extraction for three
document types: Nepali Citizenship Card, Nepali Passport and Nepali Driving
License. PaddleOCR is synchronous, so the OCR work is dispatched to an asyncio
executor to keep the service async-compatible. OCR engines are created once as
module-level singletons to avoid expensive per-request model reloads.
"""

from __future__ import annotations

import asyncio
import io
import logging
import re
import time
from enum import Enum
from threading import Lock
from typing import Any, Dict, List, Optional, Tuple

import numpy as np
from PIL import Image, ImageEnhance
from pydantic import BaseModel, Field

from app.core.config import settings

logger = logging.getLogger(__name__)

# Minimum width (px) required before OCR; smaller images are upscaled.
_MIN_WIDTH = 800
# Contrast multiplier applied during pre-processing.
_CONTRAST_FACTOR = 1.3


class DocumentType(str, Enum):
    """Supported KYC document categories."""

    CITIZENSHIP = "citizenship"
    PASSPORT = "passport"
    DRIVING_LICENSE = "driving_license"
    NATIONAL_ID = "national_id"
    UNKNOWN = "unknown"


class OCRResult(BaseModel):
    """Structured response returned by the OCR service."""

    document_type: DocumentType = Field(
        ..., description="Detected document type."
    )
    extracted_fields: Dict[str, Any] = Field(
        default_factory=dict,
        description="Structured fields parsed from the document text.",
    )
    raw_text: str = Field(
        default="", description="All recognised text joined with newlines."
    )
    confidence_score: float = Field(
        default=0.0,
        ge=0.0,
        le=1.0,
        description="Mean confidence across all recognised text blocks.",
    )
    processing_time_ms: int = Field(
        default=0, description="End-to-end processing time in milliseconds."
    )


# ---------------------------------------------------------------------------
# PaddleOCR singletons
# ---------------------------------------------------------------------------

_engines: Dict[str, Any] = {}
_engine_lock = Lock()


def _build_engine(lang: str) -> Any:
    """Construct a PaddleOCR engine for ``lang``.

    The requested constructor signature (``use_angle_cls``, ``use_gpu``,
    ``show_log``) targets the PaddleOCR 2.x API. Newer 3.x releases dropped
    some of these keyword arguments, so unsupported kwargs are stripped and
    construction is retried to stay resilient across versions.
    """
    from paddleocr import PaddleOCR  # imported lazily to speed up app startup

    kwargs: Dict[str, Any] = {
        "use_angle_cls": True,
        "lang": lang,
        "use_gpu": settings.PADDLE_OCR_USE_GPU,
        "show_log": False,
    }
    # PaddleOCR 2.x raises TypeError for unknown kwargs, while 3.x raises
    # ValueError ("Unknown argument: ..."); catch both so the strip-and-retry
    # fallback works across versions.
    while True:
        try:
            return PaddleOCR(**kwargs)
        except (TypeError, ValueError) as exc:  # unsupported kwarg for this version
            message = str(exc)
            removed = False
            for key in ("show_log", "use_gpu", "use_angle_cls"):
                if key in kwargs and key in message:
                    kwargs.pop(key)
                    removed = True
                    break
            if not removed:
                # Drop optional kwargs as a last resort, keep only ``lang``.
                if len(kwargs) > 1:
                    kwargs = {"lang": lang}
                    continue
                raise


def get_engine(lang: str) -> Any:
    """Return a cached PaddleOCR engine for ``lang``, creating it on first use."""
    engine = _engines.get(lang)
    if engine is not None:
        return engine
    with _engine_lock:
        engine = _engines.get(lang)
        if engine is None:
            logger.info("Initialising PaddleOCR engine (lang=%s)", lang)
            engine = _build_engine(lang)
            _engines[lang] = engine
        return engine


# ---------------------------------------------------------------------------
# Pre-processing
# ---------------------------------------------------------------------------


def preprocess_image(image_bytes: bytes) -> np.ndarray:
    """Decode and normalise raw image bytes for OCR.

    Converts to RGB, upscales narrow images to at least ``_MIN_WIDTH`` while
    preserving aspect ratio, and applies a mild contrast enhancement.

    Returns the processed image as an ``np.ndarray`` (RGB) ready for PaddleOCR.
    """
    image = Image.open(io.BytesIO(image_bytes))
    if image.mode != "RGB":
        image = image.convert("RGB")

    width, height = image.size
    if width < _MIN_WIDTH:
        scale = _MIN_WIDTH / float(width)
        new_size = (_MIN_WIDTH, max(1, int(round(height * scale))))
        image = image.resize(new_size, Image.LANCZOS)

    image = ImageEnhance.Contrast(image).enhance(_CONTRAST_FACTOR)
    return np.asarray(image)


# ---------------------------------------------------------------------------
# OCR execution
# ---------------------------------------------------------------------------


def _parse_ocr_output(result: Any) -> List[Tuple[str, float]]:
    """Normalise PaddleOCR output into ``(text, confidence)`` tuples.

    Handles both the classic 2.x nested-list format
    (``[[[box, (text, score)], ...]]``) and the 3.x ``predict`` dictionary
    format (``{"rec_texts": [...], "rec_scores": [...]}``).
    """
    blocks: List[Tuple[str, float]] = []
    if not result:
        return blocks

    for page in result:
        if page is None:
            continue
        # 3.x predict() dict-style result.
        if isinstance(page, dict):
            texts = page.get("rec_texts", [])
            scores = page.get("rec_scores", [])
            for text, score in zip(texts, scores):
                if text:
                    blocks.append((str(text), float(score)))
            continue
        # 2.x ocr() list-style result.
        if isinstance(page, (list, tuple)):
            for line in page:
                try:
                    text, score = line[1][0], line[1][1]
                    if text:
                        blocks.append((str(text), float(score)))
                except (IndexError, TypeError, ValueError):
                    continue
    return blocks


def _run_engine(engine: Any, image: np.ndarray) -> List[Tuple[str, float]]:
    """Run a single PaddleOCR engine and return normalised text blocks.

    Tries the ``ocr`` API (with and without the ``cls`` kwarg) and falls back
    to ``predict`` to remain compatible across PaddleOCR versions.
    """
    raw: Any = None
    if hasattr(engine, "ocr"):
        try:
            raw = engine.ocr(image, cls=True)
        except (TypeError, ValueError):
            try:
                raw = engine.ocr(image)
            except Exception:  # noqa: BLE001 - fall through to predict
                raw = None
    if raw is None and hasattr(engine, "predict"):
        raw = engine.predict(image)
    return _parse_ocr_output(raw)


def _ocr_sync(image: np.ndarray) -> List[Tuple[str, float]]:
    """Run primary (en) and fallback (ch) OCR engines and merge their blocks.

    English is the primary language; the ``ch`` engine is used as a fallback to
    recover Devanagari text on Nepali documents. Duplicate text blocks are
    de-duplicated, keeping the highest confidence score.
    """
    primary_lang = settings.PADDLE_OCR_LANG or "en"
    merged: Dict[str, float] = {}
    order: List[str] = []

    for lang in (primary_lang, "ne"):
        try:
            engine = get_engine(lang)
            blocks = _run_engine(engine, image)
        except Exception as exc:  # noqa: BLE001 - one engine failing is non-fatal
            logger.warning("PaddleOCR engine (lang=%s) failed: %s", lang, exc)
            continue
        for text, score in blocks:
            key = text.strip()
            if not key:
                continue
            if key not in merged:
                order.append(key)
                merged[key] = score
            else:
                merged[key] = max(merged[key], score)

    return [(text, merged[text]) for text in order]


# ---------------------------------------------------------------------------
# Document type detection
# ---------------------------------------------------------------------------


def detect_document_type(raw_text: str) -> DocumentType:
    """Infer the document type from recognised text using keyword patterns."""
    text = raw_text.lower()

    citizenship_markers = (
        "नागरिकता",
        "नागरिकताको",
        "ना.प्र.न",
        "ना.प्र.नं",
        "नाप्र.न",
        "नाप्र.नं",
        "ना. प्र.",
        "citizenship no",
        "citizenship number",
        "certificate of nepali citizenship",
    )
    passport_markers = (
        "passport",
        "राहदानी",
    )
    license_markers = (
        "सवारी चालक",
        "driving license",
        "driving licence",
        "department of transport management",
    )
    national_id_markers = (
        "national identity card",
        "national identity number",
        "राष्ट्रिय परिचयपत्र",
        "राष्ट्रिय परिचय",
    )

    has_mrz = bool(re.search(r"\bP<", raw_text))

    if any(marker in text for marker in citizenship_markers):
        return DocumentType.CITIZENSHIP
    if any(marker in text for marker in national_id_markers):
        return DocumentType.NATIONAL_ID
    if has_mrz or any(marker in text for marker in passport_markers):
        if "nepal" in text or has_mrz or "राहदानी" in raw_text:
            return DocumentType.PASSPORT
    if any(marker in text for marker in license_markers):
        return DocumentType.DRIVING_LICENSE

    return DocumentType.UNKNOWN


# ---------------------------------------------------------------------------
# Field extraction helpers
# ---------------------------------------------------------------------------

_DATE_RE = re.compile(
    r"\b(\d{4}[-/.]\d{1,2}[-/.]\d{1,2}|\d{1,2}[-/.]\d{1,2}[-/.]\d{2,4})\b"
)
_DEVANAGARI_RE = re.compile(r"[\u0900-\u097F]")


def _find_dates(text: str) -> List[str]:
    """Return all date-like substrings found in ``text``."""
    return _DATE_RE.findall(text)


def _value_after_keyword(
    lines: List[str], keywords: Tuple[str, ...]
) -> Optional[str]:
    """Find the value associated with a label.

    Looks for ``keyword: value`` on the same line first, otherwise returns the
    next non-empty line after a line containing the keyword.  If the extracted
    value still looks like a label (contains one of the keywords), it is
    skipped in favour of the following line.
    """
    lowered = [line.lower() for line in lines]
    for idx, line in enumerate(lowered):
        for kw in keywords:
            if kw in line:
                after = lines[idx]
                # Prefer text after a separator on the same line.
                parts = re.split(r"[:：\-]", after, maxsplit=1)
                if len(parts) == 2 and parts[1].strip():
                    candidate = parts[1].strip()
                    # Guard: if the candidate still contains a search keyword
                    # it is likely the label itself, not the value.
                    cand_low = candidate.lower()
                    if not any(k in cand_low for k in keywords):
                        return candidate
                # Fall through to the next non-empty line.
                if idx + 1 < len(lines) and lines[idx + 1].strip():
                    return lines[idx + 1].strip()
    return None


def _first_devanagari_line(lines: List[str]) -> Optional[str]:
    """Return the first line that contains Devanagari characters."""
    for line in lines:
        if _DEVANAGARI_RE.search(line):
            return line.strip()
    return None


_DEVANAGARI_DIGIT_MAP = str.maketrans("०१२३४५६७८९", "0123456789")


def _devanagari_to_ascii(text: str) -> str:
    """Transliterate Devanagari digits (०-९) to ASCII digits (0-9)."""
    return text.translate(_DEVANAGARI_DIGIT_MAP)


def _detect_gender(lines: List[str], raw_text: str) -> Optional[str]:
    """Detect gender from OCR text, handling Nepali and English labels.

    Checks for explicit gender words, Nepali labels (लिङ्ग), and standalone
    single-letter markers (F/M) that commonly appear on ID cards.
    """
    if re.search(r"\bfemale\b", raw_text, re.IGNORECASE) or "महिला" in raw_text:
        return "female"
    if (
        re.search(r"\bmale\b", raw_text, re.IGNORECASE)
        or "पुरुष" in raw_text
        or "पुरूष" in raw_text
    ):
        return "male"
    if "अन्य" in raw_text:
        return "other"

    # Look for लिङ्ग (gender) label and extract the value after it.
    gender_val = _value_after_keyword(lines, ("लिङ्ग", "लिड्ंग", "लिंग"))
    if gender_val:
        gv = gender_val.strip().lower()
        if "महिला" in gender_val or gv == "f" or "female" in gv:
            return "female"
        if "पुरुष" in gender_val or "पुरूष" in gender_val or gv == "m" or "male" in gv:
            return "male"
        if "अन्य" in gender_val or "other" in gv:
            return "other"

    # Standalone F/M letter on its own line (common on NID cards).
    for line in lines:
        token = line.strip().upper()
        if token in ("F", "M"):
            return "female" if token == "F" else "male"
    return None


def _extract_name_blocks(lines: List[str]) -> List[str]:
    """Extract parent/spouse name values from citizenship card by position.

    On a standard Nepali citizenship card the father, mother and spouse blocks
    each have a label line containing ``नाम`` or ``थर`` followed by the actual
    name on the next line.  This helper scans past the DOB section and returns
    up to three Devanagari name values found in that pattern.
    """
    names: List[str] = []
    # Skip lines until we're past the DOB / address section.
    start = 0
    for i, line in enumerate(lines):
        if re.search(r"(जन्म\s*मिति|जज्म\s*मिति|साल|date of birth)", line, re.IGNORECASE):
            start = i + 1
            break

    i = start
    while i < len(lines):
        line_low = lines[i].lower()
        # A label line containing name/थर fragments.
        if any(frag in line_low for frag in ("नाम", "थर", "name")):
            # The next line is the value if it looks like a Devanagari name
            # (has Devanagari chars and isn't another label/address).
            if i + 1 < len(lines):
                candidate = lines[i + 1].strip()
                cand_low = candidate.lower()
                is_label = any(
                    frag in cand_low
                    for frag in ("ना.प्र", "ठेगाना", "ठैगाना", "डेगाना", "ना.कि", "address")
                )
                if _DEVANAGARI_RE.search(candidate) and not is_label:
                    names.append(candidate)
                    i += 2
                    continue
        i += 1
    return names


def _extract_citizenship(lines: List[str], raw_text: str) -> Dict[str, Any]:
    """Extract structured fields from a Nepali citizenship card.

    Handles both English-text cards and Devanagari-only cards by searching for
    keywords in both scripts.  Nepali citizenship numbers follow a
    ``DD-DD-DD-DDDDD`` pattern (Devanagari or ASCII digits).
    """
    fields: Dict[str, Any] = {}

    # --- Name ---
    name_nep = _value_after_keyword(lines, ("नाम थर", "नाम"))
    fields["full_name_nepali"] = name_nep or _first_devanagari_line(lines)
    fields["full_name"] = (
        _value_after_keyword(lines, ("name", "full name")) or name_nep
    )

    # --- Citizenship number ---
    # ना.प्र.नं. pattern: groups of digits separated by dashes (ASCII or
    # Devanagari digits ०-९).  Normalise Devanagari digits to ASCII.
    cit_no = re.search(
        r"(?:ना\.प्र\.(?:नं?|न)\.?\s*[:：]?\s*|citizenship\s*(?:no|number)\.?\s*[:：]?\s*)"
        r"([\d०-९][\d०-९\-/\s]{4,})",
        raw_text,
        re.IGNORECASE,
    )
    if not cit_no:
        cit_no = re.search(
            r"\b([\d०-९]{2,3}[-][\d०-९]{2,3}[-][\d०-९]{2,3}[-][\d०-९]{4,6})\b",
            raw_text,
        )
    if cit_no:
        fields["citizenship_number"] = _devanagari_to_ascii(cit_no.group(1).strip())
    else:
        fields["citizenship_number"] = None

    # --- Date of birth ---
    # Search for the Nepali BS date pattern (साल/महिना/गते) directly in the
    # full text first — this is the most reliable signal on citizenship cards
    # and avoids the "जन्म स्थान" (birthplace) vs "जन्म मिति" (DOB) clash.
    # The visarga (ः) and ASCII colon (:) are interchangeable in OCR output.
    bs_match = re.search(
        r"साल\s*[:：ः]?\s*([\d०-९]{4})\s*महिना\s*[:：ः]?\s*([\d०-९]{1,2})\s*गते\s*[:：ः]?\s*([\d०-९]{1,2})",
        raw_text,
    )
    if bs_match:
        y = _devanagari_to_ascii(bs_match.group(1))
        m = _devanagari_to_ascii(bs_match.group(2))
        d = _devanagari_to_ascii(bs_match.group(3))
        fields["date_of_birth"] = f"{y}-{m.zfill(2)}-{d.zfill(2)}"
        fields["date_of_birth_bs"] = fields["date_of_birth"]
    else:
        dob_text = _value_after_keyword(
            lines, ("जन्म मिति", "जज्म मिति", "date of birth")
        )
        if dob_text:
            date_match = _DATE_RE.search(_devanagari_to_ascii(dob_text))
            fields["date_of_birth"] = (
                date_match.group(0) if date_match else dob_text
            )
        else:
            dates = _find_dates(raw_text)
            fields["date_of_birth"] = dates[0] if dates else None

    # --- Gender ---
    gender = _detect_gender(lines, raw_text)
    fields["gender"] = gender

    # --- Address / district ---
    fields["permanent_address"] = _value_after_keyword(
        lines, ("स्थायी बासस्थान", "स्थायी बसस्थान", "permanent address", "ठेगाना", "ठैगाना", "डेगाना")
    )
    fields["district"] = _value_after_keyword(
        lines, ("जिल्ला", "district")
    )

    # --- Issued date / district ---
    fields["issued_date"] = _value_after_keyword(
        lines, ("जारी मिति", "issued date", "date of issue", "date of isue", "date of isu")
    )
    fields["issued_district"] = _value_after_keyword(
        lines, ("जारी जिल्ला", "जिल्ला प्रशासन", "issued district", "issuing district")
    )

    # --- Father / mother / spouse ---
    # OCR often garbles Devanagari labels so we use many partial variants and
    # also look for the line-position pattern on standard citizenship cards.
    father_keywords = (
        "बाबुको नाम", "बाबु", "बुबा", "पिता",
        "father", "father's name", "pather",
    )
    mother_keywords = (
        "आमाको नाम", "आमा", "माता",
        "mother", "mother's name",
    )
    spouse_keywords = (
        "पति/पत्नीको", "पति/पत्नी", "पति", "पत्नी",
        "spouse", "husband", "wife",
    )

    fields["father_name"] = _value_after_keyword(lines, father_keywords)
    fields["mother_name"] = _value_after_keyword(lines, mother_keywords)
    spouse = _value_after_keyword(lines, spouse_keywords)
    if spouse:
        fields["spouse_name"] = spouse

    # Positional fallback: on standard citizenship cards the section order is
    # …, father block, mother block, spouse block.  If keyword lookup failed,
    # find the name-like Devanagari line that immediately follows the garbled
    # label line containing "नाम" or "थर" fragments.
    if not fields["father_name"] or not fields["mother_name"]:
        name_blocks = _extract_name_blocks(lines)
        if not fields["father_name"] and len(name_blocks) >= 1:
            fields["father_name"] = name_blocks[0]
        if not fields["mother_name"] and len(name_blocks) >= 2:
            fields["mother_name"] = name_blocks[1]
        if not spouse and len(name_blocks) >= 3:
            fields["spouse_name"] = name_blocks[2]
    return fields


def _extract_passport(lines: List[str], raw_text: str) -> Dict[str, Any]:
    """Extract structured fields from a Nepali passport, incl. MRZ parsing."""
    fields: Dict[str, Any] = {}

    mrz_lines = [
        line.strip()
        for line in lines
        if "<" in line and re.search(r"[A-Z0-9<]{10,}", line.upper())
    ]
    mrz_line1 = next(
        (line for line in mrz_lines if line.upper().startswith("P<")), None
    )
    if mrz_line1:
        remaining = [line for line in mrz_lines if line != mrz_line1]
        mrz_line2 = remaining[0] if remaining else None
    else:
        mrz_line1 = mrz_lines[0] if mrz_lines else None
        mrz_line2 = mrz_lines[1] if len(mrz_lines) > 1 else None
    fields["mrz_line1"] = mrz_line1
    fields["mrz_line2"] = mrz_line2

    passport_no = re.search(
        r"(?:passport\s*(?:no|number)\.?\s*[:：]?\s*)?\b([A-Z]{1,2}\d{6,8})\b",
        raw_text,
        re.IGNORECASE,
    )
    fields["passport_number"] = (
        passport_no.group(1).upper() if passport_no else None
    )

    # Name from MRZ line 1: P<NPL<SURNAME<<GIVEN<NAMES
    full_name = _value_after_keyword(lines, ("name", "surname", "given name"))
    if not full_name and mrz_line1:
        body = re.sub(r"^P<[A-Z]{3}", "", mrz_line1.upper())
        parts = body.split("<<")
        if len(parts) >= 2:
            surname = parts[0].replace("<", " ").strip()
            given = parts[1].replace("<", " ").strip()
            full_name = f"{given} {surname}".strip()
    fields["full_name"] = full_name

    fields["nationality"] = (
        "NEPALI"
        if re.search(r"\b(nepali|npl|nepalese)\b", raw_text, re.IGNORECASE)
        else _value_after_keyword(lines, ("nationality",))
    )
    fields["place_of_birth"] = _value_after_keyword(
        lines, ("place of birth",)
    )

    dob = _value_after_keyword(lines, ("date of birth",))
    fields["date_of_birth"] = (
        (_DATE_RE.search(dob).group(0) if _DATE_RE.search(dob) else dob)
        if dob
        else None
    )
    fields["date_of_issue"] = _value_after_keyword(
        lines, ("date of issue",)
    )
    fields["date_of_expiry"] = _value_after_keyword(
        lines, ("date of expiry", "date of expiration")
    )
    return fields


def _extract_driving_license(lines: List[str], raw_text: str) -> Dict[str, Any]:
    """Extract structured fields from a Nepali driving license."""
    fields: Dict[str, Any] = {}

    fields["full_name"] = _value_after_keyword(lines, ("name", "नाम"))

    lic_no = re.search(
        r"(?:license\s*(?:no|number)|d\.?l\.?\s*no)\.?\s*[:：]?\s*"
        r"([\dA-Z][\dA-Z\-/\s]{4,})",
        raw_text,
        re.IGNORECASE,
    )
    fields["license_number"] = lic_no.group(1).strip() if lic_no else None

    dob = _value_after_keyword(lines, ("date of birth", "d.o.b", "जन्म"))
    fields["date_of_birth"] = (
        (_DATE_RE.search(dob).group(0) if _DATE_RE.search(dob) else dob)
        if dob
        else None
    )

    fields["address"] = _value_after_keyword(lines, ("address", "ठेगाना"))

    categories = re.search(
        r"category\s*[:：]?\s*([A-Z](?:\s*[,/]\s*[A-Z])*)",
        raw_text,
        re.IGNORECASE,
    )
    if categories:
        cats = re.findall(r"[A-Z]", categories.group(1).upper())
        fields["license_categories"] = cats
    else:
        fields["license_categories"] = []

    fields["date_of_issue"] = _value_after_keyword(
        lines, ("date of issue", "doi")
    )
    fields["date_of_expiry"] = _value_after_keyword(
        lines, ("date of expiry", "doe", "valid")
    )

    blood = re.search(r"\b(AB|A|B|O)\s*([+-]|positive|negative)\b", raw_text, re.IGNORECASE)
    if blood:
        sign = blood.group(2).lower()
        sign = "+" if sign in ("+", "positive") else "-"
        fields["blood_group"] = f"{blood.group(1).upper()}{sign}"
    else:
        fields["blood_group"] = None
    return fields


def _find_birth_date(lines: List[str], raw_text: str) -> Optional[str]:
    """Find the AD date of birth, tolerating noisy OCR.

    Prefers the value after a "date of birth" label; otherwise scans for a
    year-first date with a valid month (1-12) and day (1-31) and a plausible
    AD birth year. This avoids selecting garbled Bikram-Sambat dates (e.g.
    ``2038-90-23``) that share the year-first layout on Nepali ID cards.
    """
    candidates: List[str] = []
    labelled = _value_after_keyword(lines, ("date of birth", "जन्म"))
    if labelled:
        candidates.append(labelled)
    candidates.append(raw_text)

    ymd_re = re.compile(r"\b(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})\b")
    for source in candidates:
        for match in ymd_re.finditer(source):
            year, month, day = (int(g) for g in match.groups())
            if 1 <= month <= 12 and 1 <= day <= 31 and 1900 <= year <= 2025:
                return match.group(0)
    return None


def _extract_national_id(lines: List[str], raw_text: str) -> Dict[str, Any]:
    """Extract structured fields from a Nepal National Identity Card (NIN).

    Uses both English and Nepali keyword variants, and tolerates common OCR
    garbling (e.g. ``PATHER`` for ``FATHER``, ``ISUE`` for ``ISSUE``).
    """
    fields: Dict[str, Any] = {}

    # --- NIN (e.g. 023-456-2130, or Devanagari २३-४५६-२५३०) ---
    nin = re.search(r"\b(\d{2,3}-\d{3}-\d{4})\b", raw_text)
    if not nin:
        nin_dev = re.search(r"([\d०-९]{2,3}-[\d०-९]{3}-[\d०-९]{4})", raw_text)
        if nin_dev:
            fields["nin"] = _devanagari_to_ascii(nin_dev.group(1))
        else:
            fields["nin"] = _value_after_keyword(
                lines, ("nin", "identity number", "परिचय न")
            )
    else:
        fields["nin"] = nin.group(1)

    # --- Names ---
    surname = _value_after_keyword(lines, ("surname", "थर"))
    given_name = _value_after_keyword(lines, ("given name", "नाम"))
    # Fall back to Title-Case lines when labels are garbled.
    if not surname or not given_name:
        name_lines = [
            line.strip()
            for line in lines
            if re.fullmatch(r"[A-Z][a-z]+(?:\s+[A-Z][a-z]+)+", line.strip())
        ]
        if not surname and name_lines:
            surname = name_lines[0]
        if not given_name and len(name_lines) > 1:
            given_name = name_lines[1]
    if given_name and surname:
        fields["full_name"] = f"{given_name} {surname}".strip()
    else:
        fields["full_name"] = given_name or surname
    fields["surname"] = surname
    fields["given_name"] = given_name
    # Devanagari name — must have Devanagari chars, no digits, no Latin
    # garbage, and not be a header or label line.
    _skip = ("सरकार", "नेपाल", "राष्ट्र", "परिचय", "NATIONAL", "IDENTITY", "नाम", "मिति")
    nep_names = [
        ln.strip()
        for ln in lines
        if _DEVANAGARI_RE.search(ln)
        and not re.search(r"[\d0-9]", ln)
        and not re.search(r"[A-Z]{3,}", ln)
        and not any(kw in ln for kw in _skip)
    ]
    fields["full_name_nepali"] = nep_names[0] if nep_names else None

    # --- DOB ---
    fields["date_of_birth"] = _find_birth_date(lines, raw_text)

    # --- Gender ---
    fields["gender"] = _detect_gender(lines, raw_text)

    # --- Nationality ---
    if re.search(r"\b(nepalese|nepali)\b", raw_text, re.IGNORECASE):
        fields["nationality"] = "Nepalese"
    else:
        fields["nationality"] = _value_after_keyword(lines, ("nationality",))

    # --- Mother / Father ---
    fields["mother_name"] = _value_after_keyword(
        lines,
        ("आमाको नाम", "आमा", "माता", "mother's name", "mother", "mothers name"),
    )
    fields["father_name"] = _value_after_keyword(
        lines,
        (
            "बाबुको नाम", "बाबु", "बुबा", "पिता",
            "father's name", "father", "pather's name", "pather",
            "fathers name",
        ),
    )

    # --- Date of issue ---
    doi = _value_after_keyword(
        lines,
        ("date of issue", "date of isue", "date of isu", "date of ssue", "जारी मिति", "जारी"),
    )
    if not doi:
        # Fall back to the DD-MM-YYYY date near the bottom of the text.
        dmy_matches = re.findall(r"\b(\d{2}-\d{2}-\d{4})\b", raw_text)
        doi = dmy_matches[-1] if dmy_matches else None
    fields["date_of_issue"] = doi

    return fields


def extract_fields(doc_type: DocumentType, raw_text: str) -> Dict[str, Any]:
    """Dispatch field extraction based on the detected document type.

    When the type is ``UNKNOWN``, every extractor is tried and the one that
    populates the most non-null fields wins — so the response is never empty
    if there is *any* recognisable data in the text.
    """
    lines = [line.strip() for line in raw_text.splitlines() if line.strip()]
    extractors = {
        DocumentType.CITIZENSHIP: _extract_citizenship,
        DocumentType.PASSPORT: _extract_passport,
        DocumentType.DRIVING_LICENSE: _extract_driving_license,
        DocumentType.NATIONAL_ID: _extract_national_id,
    }
    if doc_type in extractors:
        return extractors[doc_type](lines, raw_text)

    # Best-effort: try all extractors and keep the richest result.
    best: Dict[str, Any] = {}
    best_count = 0
    for fn in extractors.values():
        try:
            candidate = fn(lines, raw_text)
        except Exception:  # noqa: BLE001
            continue
        filled = sum(1 for v in candidate.values() if v is not None and v != "" and v != [])
        if filled > best_count:
            best = candidate
            best_count = filled
    return best


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------


def _extract_sync(
    image_bytes: bytes, document_type_hint: Optional[str] = None
) -> OCRResult:
    """Synchronous OCR pipeline executed inside an executor thread."""
    start = time.perf_counter()

    image = preprocess_image(image_bytes)
    blocks = _ocr_sync(image)

    texts = [text for text, _ in blocks]
    scores = [score for _, score in blocks]
    raw_text = "\n".join(texts)
    confidence = float(np.mean(scores)) if scores else 0.0

    doc_type = _resolve_document_type(raw_text, document_type_hint)
    fields = extract_fields(doc_type, raw_text)

    elapsed_ms = int((time.perf_counter() - start) * 1000)
    return OCRResult(
        document_type=doc_type,
        extracted_fields=fields,
        raw_text=raw_text,
        confidence_score=round(confidence, 4),
        processing_time_ms=elapsed_ms,
    )


def _resolve_document_type(
    raw_text: str, hint: Optional[str]
) -> DocumentType:
    """Resolve document type, honouring a valid caller-provided hint first."""
    if hint:
        try:
            return DocumentType(hint.strip().lower())
        except ValueError:
            logger.debug("Ignoring unrecognised document_type_hint: %s", hint)
    return detect_document_type(raw_text)


async def extract_document(
    image_bytes: bytes, document_type_hint: Optional[str] = None
) -> OCRResult:
    """Run the full OCR + extraction pipeline asynchronously.

    PaddleOCR is synchronous, so the blocking work runs in the default thread
    pool executor via :func:`asyncio.to_thread`.

    Args:
        image_bytes: Raw image content (jpeg/png/webp/tiff) as bytes.
        document_type_hint: Optional document type to bias detection.

    Returns:
        A populated :class:`OCRResult`.
    """
    return await asyncio.to_thread(_extract_sync, image_bytes, document_type_hint)


def supported_documents() -> List[Dict[str, Any]]:
    """Return the supported document types and their extractable fields."""
    return [
        {
            "document_type": DocumentType.CITIZENSHIP.value,
            "fields": [
                "full_name",
                "full_name_nepali",
                "citizenship_number",
                "date_of_birth",
                "gender",
                "permanent_address",
                "district",
                "issued_date",
                "issued_district",
                "father_name",
                "mother_name",
                "spouse_name",
            ],
        },
        {
            "document_type": DocumentType.PASSPORT.value,
            "fields": [
                "full_name",
                "passport_number",
                "date_of_birth",
                "place_of_birth",
                "date_of_issue",
                "date_of_expiry",
                "nationality",
                "mrz_line1",
                "mrz_line2",
            ],
        },
        {
            "document_type": DocumentType.DRIVING_LICENSE.value,
            "fields": [
                "full_name",
                "license_number",
                "date_of_birth",
                "address",
                "license_categories",
                "date_of_issue",
                "date_of_expiry",
                "blood_group",
            ],
        },
        {
            "document_type": DocumentType.NATIONAL_ID.value,
            "fields": [
                "full_name",
                "surname",
                "given_name",
                "full_name_nepali",
                "nin",
                "date_of_birth",
                "gender",
                "nationality",
                "mother_name",
                "father_name",
                "date_of_issue",
            ],
        },
    ]
