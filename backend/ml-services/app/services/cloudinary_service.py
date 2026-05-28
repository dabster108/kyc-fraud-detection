"""Cloudinary upload helpers for KYC document and face-crop images.

Cloudinary's SDK is synchronous, so each upload is dispatched to the default
executor to avoid blocking the event loop. Configuration is read once at import
time from application settings.
"""

from __future__ import annotations

import asyncio
import base64  # noqa: F401 - kept per service contract (data-URI helpers)
import io  # noqa: F401 - kept per service contract (stream helpers)
import logging

import cloudinary
import cloudinary.uploader

from app.core.config import settings

logger = logging.getLogger(__name__)

cloudinary.config(
    cloud_name=settings.CLOUDINARY_CLOUD_NAME,
    api_key=settings.CLOUDINARY_API_KEY,
    api_secret=settings.CLOUDINARY_API_SECRET,
)


def _sync_upload(image_bytes: bytes, folder: str, public_id: str) -> str:
    """Synchronously upload bytes to Cloudinary and return the secure URL.

    Args:
        image_bytes: Raw image bytes to upload.
        folder: Target Cloudinary folder.
        public_id: Public identifier for the uploaded asset.

    Returns:
        The ``secure_url`` of the uploaded asset.
    """
    result = cloudinary.uploader.upload(
        image_bytes,
        folder=folder,
        public_id=public_id,
        overwrite=True,
        resource_type="image",
    )
    return result["secure_url"]


async def upload_image(
    image_bytes: bytes, folder: str, public_id: str
) -> str:
    """Upload image bytes to Cloudinary and return the secure URL.

    Runs the synchronous Cloudinary upload in the default executor.

    Args:
        image_bytes: Raw image bytes to upload.
        folder: Target Cloudinary folder.
        public_id: Public identifier for the uploaded asset.

    Returns:
        The ``secure_url`` of the uploaded image.
    """
    loop = asyncio.get_event_loop()
    return await loop.run_in_executor(
        None, _sync_upload, image_bytes, folder, public_id
    )


async def upload_face_crop(face_bytes: bytes, submission_id: str) -> str:
    """Upload a cropped face image and return its secure URL.

    Args:
        face_bytes: JPEG-encoded bytes of the cropped face.
        submission_id: Submission identifier used to build the public id.

    Returns:
        The ``secure_url`` of the uploaded face crop.
    """
    return await upload_image(
        face_bytes,
        folder="kyc/faces",
        public_id=f"face_{submission_id}",
    )
