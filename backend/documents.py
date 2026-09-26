"""Turn an uploaded file into plain-text chunks the browser can index and search.

The server never stores documents: it extracts text, chunks it and hands it back.
"""

import io
import re
from pathlib import PurePath

import config

TEXT_EXTENSIONS = {
    ".txt", ".md", ".markdown", ".csv", ".json", ".yaml", ".yml", ".xml", ".html", ".htm",
    ".py", ".js", ".jsx", ".ts", ".tsx", ".java", ".c", ".cpp", ".h", ".cs", ".go", ".rs",
    ".rb", ".php", ".sql", ".sh", ".css", ".tex", ".log", ".ini", ".toml",
}
SUPPORTED_EXTENSIONS = TEXT_EXTENSIONS | {".pdf"}


class DocumentError(ValueError):
    pass


def extract_text(filename: str, data: bytes) -> str:
    suffix = PurePath(filename).suffix.lower()
    if suffix not in SUPPORTED_EXTENSIONS:
        raise DocumentError(f"Unsupported file type “{suffix or filename}”. Upload a PDF or a text file.")

    if suffix == ".pdf":
        from pypdf import PdfReader
        from pypdf.errors import PdfReadError

        try:
            reader = PdfReader(io.BytesIO(data))
            if reader.is_encrypted:
                raise DocumentError("This PDF is password-protected.")
            pages = [page.extract_text() or "" for page in reader.pages]
        except PdfReadError as exc:
            raise DocumentError("This PDF could not be read.") from exc
        text = "\n\n".join(pages)
    else:
        try:
            text = data.decode("utf-8")
        except UnicodeDecodeError:
            text = data.decode("latin-1")

    text = text.replace("\r\n", "\n").replace("\x00", "")
    text = re.sub(r"[ \t]+\n", "\n", text)
    text = re.sub(r"\n{3,}", "\n\n", text).strip()
    if not text:
        raise DocumentError("No text could be extracted — scanned PDFs without OCR aren't supported.")
    return text[: config.MAX_DOCUMENT_CHARS]


def chunk_text(text: str, size: int = 1_200, overlap: int = 150) -> list[str]:
    """Split on paragraph boundaries into ~`size`-character chunks with a little overlap."""
    paragraphs = [p.strip() for p in text.split("\n\n") if p.strip()]
    pieces: list[str] = []
    for paragraph in paragraphs:
        while len(paragraph) > size:
            cut = paragraph.rfind(" ", 0, size)
            cut = cut if cut > size // 2 else size
            pieces.append(paragraph[:cut].strip())
            paragraph = paragraph[cut:].strip()
        if paragraph:
            pieces.append(paragraph)

    chunks: list[str] = []
    current = ""
    for piece in pieces:
        if current and len(current) + len(piece) + 2 > size:
            chunks.append(current)
            tail = current[-overlap:]
            space = tail.find(" ")
            current = (tail[space + 1:] if space != -1 else tail) + "\n\n" + piece
        else:
            current = f"{current}\n\n{piece}" if current else piece
    if current:
        chunks.append(current)
    return chunks
