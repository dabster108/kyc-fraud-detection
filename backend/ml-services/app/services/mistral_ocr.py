import asyncio
import base64
import hashlib
import json
import logging
import os
import re
import time
import uuid
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple
from urllib import request, error as url_error

from mistralai import Mistral
from pdf2image import convert_from_bytes
from PIL import Image

from app.core.config import settings

logger = logging.getLogger(__name__)

CACHE_TTL_SECONDS = 24 * 60 * 60
MAX_PAGES = 4
SUPPORTED_IMAGE_EXTENSIONS = {".jpg", ".jpeg", ".png"}
SUPPORTED_PDF_EXTENSIONS = {".pdf"}


@dataclass
class OCRResult:
    extracted_data: Dict[str, Any]
    ocr_metadata: Dict[str, Any]
    raw_text: str


class MistralOCRService:
    def __init__(self) -> None:
        self.api_key = os.getenv("MISTRAL_API_KEY", "").strip()
        self.ocr_model = os.getenv("MISTRAL_OCR_MODEL", "mistral-ocr-2512")
        self.vision_model = os.getenv("MISTRAL_VISION_MODEL", "pixtral-12b-2409")
        self.client: Optional[Mistral] = None
        if self.api_key:
            self.client = Mistral(api_key=self.api_key)

        self.cache_dir = Path(settings.TEMP_DIR) / "ocr_cache"
        self.cache_dir.mkdir(parents=True, exist_ok=True)

    async def extract_document(
        self,
        file_bytes: bytes,
        filename: str,
        document_type: str,
        request_id: Optional[str] = None,
    ) -> OCRResult:
        request_id = request_id or str(uuid.uuid4())
        self._validate_file_size(file_bytes)

        cache_key = self._cache_key(file_bytes, filename, document_type)
        cached = self._read_cache(cache_key)
        if cached:
            logger.info("Mistral OCR cache hit", extra={"request_id": request_id})
            return cached

        start_time = time.time()
        images = await self._load_images(file_bytes, filename)
        raw_text, model_used, usage = await self._run_ocr(images, document_type, request_id)
        extracted = self._extract_fields(raw_text, document_type)
        extraction_confidence = self._estimate_confidence(raw_text)
        extracted["document_type"] = document_type
        extracted["extraction_confidence"] = extraction_confidence

        duration_ms = int((time.time() - start_time) * 1000)
        ocr_metadata = {
            "processing_time_ms": duration_ms,
            "pages_processed": len(images),
            "model_used": model_used,
            "token_usage": usage,
        }

        result = OCRResult(extracted_data=extracted, ocr_metadata=ocr_metadata, raw_text=raw_text)
        self._write_cache(cache_key, result)
        self._log_result(request_id, result)
        return result

    def _validate_file_size(self, file_bytes: bytes) -> None:
        if len(file_bytes) > settings.MAX_FILE_SIZE:
            raise ValueError("File size exceeds MAX_FILE_SIZE")

    async def _load_images(self, file_bytes: bytes, filename: str) -> List[Image.Image]:
        suffix = Path(filename).suffix.lower()
        if suffix in SUPPORTED_IMAGE_EXTENSIONS:
            return [await asyncio.to_thread(Image.open, self._bytes_to_file(file_bytes))]
        if suffix in SUPPORTED_PDF_EXTENSIONS:
            images = await asyncio.to_thread(convert_from_bytes, file_bytes)
            return images[:MAX_PAGES]
        raise ValueError("Unsupported file type")

    async def _run_ocr(
        self,
        images: List[Image.Image],
        document_type: str,
        request_id: str,
    ) -> Tuple[str, str, Dict[str, Any]]:
        if not self.api_key:
            raise RuntimeError("MISTRAL_API_KEY is not configured")

        payload = {
            "model": self.ocr_model,
            "document_type": document_type,
            "images": [self._image_to_base64(img) for img in images],
        }

        try:
            if self.client and hasattr(self.client, "ocr"):
                result = await asyncio.to_thread(
                    self.client.ocr.process,
                    model=self.ocr_model,
                    document={"type": "image_base64", "image_base64": payload["images"][0]},
                )
                raw_text = getattr(result, "text", "") or result.get("text", "")
                usage = getattr(result, "usage", None) or result.get("usage", {})
                return raw_text, self.ocr_model, usage
        except Exception as exc:
            logger.warning(
                "Mistral OCR SDK failed, falling back to HTTP",
                extra={"request_id": request_id, "error": str(exc)},
            )

        return await self._run_ocr_http(payload, request_id)

    async def _run_ocr_http(self, payload: Dict[str, Any], request_id: str) -> Tuple[str, str, Dict[str, Any]]:
        url = "https://api.mistral.ai/v1/ocr"
        headers = {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json",
        }

        body = json.dumps(payload).encode("utf-8")
        req = request.Request(url, data=body, headers=headers, method="POST")

        try:
            response = await asyncio.to_thread(request.urlopen, req)
            data = json.loads(response.read().decode("utf-8"))
            raw_text = data.get("text", "")
            usage = data.get("usage", {})
            return raw_text, payload["model"], usage
        except url_error.HTTPError as exc:
            if exc.code == 429:
                logger.warning("Mistral OCR rate limited", extra={"request_id": request_id})
            raise

    def _extract_fields(self, raw_text: str, document_type: str) -> Dict[str, Any]:
        fields: Dict[str, Any] = {
            "full_name": None,
            "date_of_birth": None,
            "document_number": None,
            "expiry_date": None,
            "address": None,
        }

        normalized = " ".join(raw_text.split())
        name_match = re.search(r"Name[:\s]+([A-Z][A-Za-z\s'-]{2,})", normalized, re.IGNORECASE)
        dob_match = re.search(r"(DOB|Date of Birth)[:\s]+([0-9]{2,4}[-/][0-9]{2}[-/][0-9]{2,4})", normalized, re.IGNORECASE)
        doc_match = re.search(r"(ID|Document|Passport|License)[^A-Z0-9]{0,6}([A-Z0-9-]{6,})", normalized, re.IGNORECASE)
        exp_match = re.search(r"(Expiry|Expiration)[:\s]+([0-9]{2,4}[-/][0-9]{2}[-/][0-9]{2,4})", normalized, re.IGNORECASE)
        addr_match = re.search(r"Address[:\s]+(.+)$", normalized, re.IGNORECASE)

        if name_match:
            fields["full_name"] = name_match.group(1).strip()
        if dob_match:
            fields["date_of_birth"] = dob_match.group(2).strip()
        if doc_match:
            fields["document_number"] = doc_match.group(2).strip()
        if exp_match:
            fields["expiry_date"] = exp_match.group(2).strip()
        if addr_match:
            fields["address"] = addr_match.group(1).strip()

        return fields

    def _estimate_confidence(self, raw_text: str) -> float:
        length = len(raw_text.strip())
        if length == 0:
            return 0.0
        if length < 40:
            return 0.4
        if length < 120:
            return 0.7
        return 0.92

    def _cache_key(self, file_bytes: bytes, filename: str, document_type: str) -> str:
        digest = hashlib.sha256(file_bytes).hexdigest()
        return f"{digest}:{filename}:{document_type}"

    def _cache_path(self, cache_key: str) -> Path:
        safe = hashlib.sha256(cache_key.encode("utf-8")).hexdigest()
        return self.cache_dir / f"{safe}.json"

    def _read_cache(self, cache_key: str) -> Optional[OCRResult]:
        path = self._cache_path(cache_key)
        if not path.exists():
            return None
        try:
            data = json.loads(path.read_text())
            expires_at = data.get("expires_at")
            if not expires_at:
                return None
            if datetime.now(timezone.utc).timestamp() > expires_at:
                return None
            return OCRResult(
                extracted_data=data.get("extracted_data", {}),
                ocr_metadata=data.get("ocr_metadata", {}),
                raw_text=data.get("raw_text", ""),
            )
        except Exception:
            return None

    def _write_cache(self, cache_key: str, result: OCRResult) -> None:
        path = self._cache_path(cache_key)
        payload = {
            "expires_at": datetime.now(timezone.utc).timestamp() + CACHE_TTL_SECONDS,
            "extracted_data": result.extracted_data,
            "ocr_metadata": result.ocr_metadata,
            "raw_text": result.raw_text,
        }
        path.write_text(json.dumps(payload))

    def _image_to_base64(self, image: Image.Image) -> str:
        with self._bytes_to_file(b"") as buffer:
            image.save(buffer, format="PNG")
            return base64.b64encode(buffer.getvalue()).decode("utf-8")

    def _bytes_to_file(self, data: bytes):
        import io

        return io.BytesIO(data)

    def _log_result(self, request_id: str, result: OCRResult) -> None:
        masked = self._mask_sensitive(result.extracted_data)
        logger.info(
            "Mistral OCR completed",
            extra={
                "request_id": request_id,
                "extracted_data": masked,
                "ocr_metadata": result.ocr_metadata,
            },
        )

    def _mask_sensitive(self, data: Dict[str, Any]) -> Dict[str, Any]:
        masked = dict(data)
        if masked.get("document_number"):
            masked["document_number"] = self._mask_value(str(masked["document_number"]))
        if masked.get("address"):
            masked["address"] = self._mask_value(str(masked["address"]))
        return masked

    def _mask_value(self, value: str) -> str:
        if len(value) <= 4:
            return "*" * len(value)
        return "*" * (len(value) - 4) + value[-4:]
