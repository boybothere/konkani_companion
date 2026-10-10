"""Document text extraction: PDF text layer first, Tesseract OCR as fallback.

- PDFs: each page's embedded text is used when it has enough characters;
  otherwise the page is rendered and OCR'd. Scanned PDFs therefore work, and
  digital PDFs keep their exact text.
- Images (PNG, JPEG, WEBP, TIFF): OCR'd directly.

Tesseract has no Konkani model, but Konkani shares the Devanagari script with
Hindi and Marathi, so the default languages are ``hin+mar+eng``.
"""

from __future__ import annotations

import io
import logging
import re
from dataclasses import dataclass
from typing import Literal

from .config import Settings

logger = logging.getLogger("konkani.ocr")

DocKind = Literal["pdf", "image"]

_MAX_IMAGE_PIXELS = 60_000_000


class DocumentError(ValueError):
    """The file is not a supported document or could not be read."""


@dataclass(frozen=True)
class ExtractResult:
    text: str
    pages: int
    method: str  # "pdf-text", "ocr" or "mixed"
    truncated: bool


def detect_kind(data: bytes) -> DocKind | None:
    """Identify the file from its first bytes, not its name or MIME type."""
    if data.startswith(b"%PDF-"):
        return "pdf"
    if data.startswith(b"\x89PNG\r\n\x1a\n") or data.startswith(b"\xff\xd8\xff"):
        return "image"
    if data[:4] == b"RIFF" and data[8:12] == b"WEBP":
        return "image"
    if data[:4] in (b"II*\x00", b"MM\x00*"):
        return "image"
    return None


def _clean(text: str) -> str:
    text = text.replace("\r", "")
    text = re.sub(r"[ \t]+", " ", text)
    text = re.sub(r" *\n *", "\n", text)
    return re.sub(r"\n{3,}", "\n\n", text).strip()


def _ocr_image(image, langs: str) -> str:
    import pytesseract

    return pytesseract.image_to_string(image, lang=langs, config="--oem 1 --psm 3")


def _prepare_image(image):
    from PIL import ImageOps

    image = ImageOps.exif_transpose(image)
    return image.convert("L")


def extract_text(data: bytes, settings: Settings) -> ExtractResult:
    kind = detect_kind(data)
    if kind == "pdf":
        return _extract_pdf(data, settings)
    if kind == "image":
        return _extract_image(data, settings)
    raise DocumentError("Unsupported file type. Upload a PDF, PNG, JPEG, WEBP or TIFF file.")


def _extract_image(data: bytes, settings: Settings) -> ExtractResult:
    from PIL import Image

    Image.MAX_IMAGE_PIXELS = _MAX_IMAGE_PIXELS
    try:
        with Image.open(io.BytesIO(data)) as image:
            text = _ocr_image(_prepare_image(image), settings.ocr_langs)
    except DocumentError:
        raise
    except Exception as exc:  # noqa: BLE001
        raise DocumentError("Could not read the image.") from exc
    return ExtractResult(text=_clean(text), pages=1, method="ocr", truncated=False)


def _extract_pdf(data: bytes, settings: Settings) -> ExtractResult:
    import pypdfium2 as pdfium

    try:
        pdf = pdfium.PdfDocument(data)
    except Exception as exc:  # noqa: BLE001 - encrypted or corrupt PDFs
        raise DocumentError("Could not open the PDF. It may be encrypted or damaged.") from exc

    try:
        total = len(pdf)
        n_pages = min(total, settings.max_document_pages)
        texts: list[str] = []
        used_text, used_ocr = False, False
        for index in range(n_pages):
            page = pdf[index]
            try:
                text = ""
                if not settings.ocr_force:
                    textpage = page.get_textpage()
                    text = textpage.get_text_range()
                    textpage.close()
                if len(text.strip()) >= settings.ocr_min_chars_per_page:
                    used_text = True
                else:
                    bitmap = page.render(scale=settings.ocr_dpi / 72)
                    image = bitmap.to_pil()
                    text = _ocr_image(_prepare_image(image), settings.ocr_langs)
                    used_ocr = True
                texts.append(_clean(text))
            finally:
                page.close()
    finally:
        pdf.close()

    method = "mixed" if used_text and used_ocr else ("ocr" if used_ocr else "pdf-text")
    return ExtractResult(
        text="\n\n".join(t for t in texts if t),
        pages=n_pages,
        method=method,
        truncated=total > n_pages,
    )
