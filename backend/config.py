"""Runtime settings, all overridable through environment variables."""

import os
from pathlib import Path

from dotenv import load_dotenv

load_dotenv(Path(__file__).parent / ".env")


def _int(name: str, default: int) -> int:
    try:
        return int(os.environ.get(name, default))
    except ValueError:
        return default


def _list(name: str, default: str) -> list[str]:
    raw = os.environ.get(name, default)
    return [item.strip().rstrip("/") for item in raw.split(",") if item.strip()]


GROQ_API_KEY = os.environ.get("GROQ_API_KEY", "")

# Model used when the client doesn't pick one, and the small model used for background jobs.
DEFAULT_MODEL = os.environ.get("DEFAULT_MODEL", "openai/gpt-oss-120b")
UTILITY_MODEL = os.environ.get("UTILITY_MODEL", "openai/gpt-oss-20b")
TRANSCRIBE_MODEL = os.environ.get("TRANSCRIBE_MODEL", "whisper-large-v3-turbo")

ALLOWED_ORIGINS = _list(
    "ALLOWED_ORIGINS",
    "https://aiolio-chatbot-app.vercel.app,http://localhost:5173,http://localhost:4173",
)

# Per-IP limits. The free Groq tier is shared by every visitor of the demo.
CHAT_PER_MINUTE = _int("RATE_LIMIT_CHAT_PER_MINUTE", 10)
CHAT_PER_DAY = _int("RATE_LIMIT_CHAT_PER_DAY", 200)
UTILITY_PER_MINUTE = _int("RATE_LIMIT_UTILITY_PER_MINUTE", 20)

# Input caps.
MAX_USER_MESSAGE_CHARS = 8_000
MAX_HISTORY_MESSAGE_CHARS = 32_000
MAX_HISTORY_MESSAGES = 200
MAX_MEMORIES = 50
MAX_MEMORY_CHARS = 300
MAX_CONTEXT_PASSAGES = 6
MAX_CONTEXT_PASSAGE_CHARS = 2_500
MAX_UPLOAD_BYTES = 5 * 1024 * 1024
MAX_DOCUMENT_CHARS = 300_000
MAX_AUDIO_BYTES = 10 * 1024 * 1024

# Upper bound on the reply length we reserve room for when trimming history.
MAX_COMPLETION_TOKENS = 4_096
