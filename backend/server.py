"""Aiolio API — a stateless FastAPI service in front of Groq.

Conversations, memories and documents live in the user's browser; every request carries
what it needs. That keeps visitors isolated from each other and survives free-tier restarts.
"""

import logging
import os
from typing import Literal, Optional

from fastapi import APIRouter, FastAPI, File, HTTPException, Request, UploadFile
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, StreamingResponse
from pydantic import BaseModel, Field
from starlette.exceptions import HTTPException as StarletteHTTPException

import config
import documents
import llm
import memory
from ratelimit import RateLimiter, client_ip

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
logger = logging.getLogger("aiolio")

VERSION = "2.0.0"

app = FastAPI(title="Aiolio API", version=VERSION)
api = APIRouter(prefix="/api")

app.add_middleware(
    CORSMiddleware,
    allow_origins=config.ALLOWED_ORIGINS,
    # Vercel preview deployments get their own sub-domain.
    allow_origin_regex=os.environ.get("ALLOWED_ORIGIN_REGEX", r"https://aiolio-chatbot-app(-[a-z0-9-]+)?\.vercel\.app"),
    allow_credentials=False,
    allow_methods=["GET", "HEAD", "POST", "OPTIONS"],
    allow_headers=["Content-Type"],
    expose_headers=["Retry-After"],
)

chat_limiter = RateLimiter("chat", [(config.CHAT_PER_MINUTE, 60), (config.CHAT_PER_DAY, 86_400)])
utility_limiter = RateLimiter("utility", [(config.UTILITY_PER_MINUTE, 60)])


# ── Error shape: {"error": {"code", "message"}} everywhere ────────────────────

def error_response(status: int, code: str, message: str, headers: dict | None = None) -> JSONResponse:
    return JSONResponse({"error": {"code": code, "message": message}}, status_code=status, headers=headers)


@app.exception_handler(llm.LLMError)
async def handle_llm_error(_: Request, exc: llm.LLMError):
    return error_response(exc.status, exc.code, exc.message)


@app.exception_handler(StarletteHTTPException)
async def handle_http_error(_: Request, exc: StarletteHTTPException):
    codes = {400: "bad_request", 404: "not_found", 405: "method_not_allowed", 413: "too_large", 429: "rate_limited"}
    return error_response(exc.status_code, codes.get(exc.status_code, "error"), str(exc.detail), getattr(exc, "headers", None))


@app.exception_handler(RequestValidationError)
async def handle_validation_error(_: Request, exc: RequestValidationError):
    first = exc.errors()[0] if exc.errors() else {}
    where = ".".join(str(p) for p in first.get("loc", [])[1:])
    message = first.get("msg", "Invalid request")
    return error_response(422, "invalid_request", f"{where}: {message}" if where else message)


# ── Schemas ───────────────────────────────────────────────────────────────────

class ChatMessage(BaseModel):
    role: Literal["user", "assistant"]
    content: str = Field(max_length=config.MAX_HISTORY_MESSAGE_CHARS)


class Passage(BaseModel):
    source: str = Field(max_length=200)
    text: str = Field(max_length=config.MAX_CONTEXT_PASSAGE_CHARS)


class ChatRequest(BaseModel):
    model: Optional[str] = Field(default=None, max_length=200)
    messages: list[ChatMessage] = Field(min_length=1, max_length=config.MAX_HISTORY_MESSAGES)
    memories: list[str] = Field(default_factory=list, max_length=config.MAX_MEMORIES)
    context: list[Passage] = Field(default_factory=list, max_length=config.MAX_CONTEXT_PASSAGES)
    reasoning_effort: Optional[Literal["low", "medium", "high"]] = None


class MemoryRequest(BaseModel):
    user: str = Field(min_length=1, max_length=config.MAX_HISTORY_MESSAGE_CHARS)
    assistant: str = Field(max_length=config.MAX_HISTORY_MESSAGE_CHARS)
    existing: list[str] = Field(default_factory=list, max_length=config.MAX_MEMORIES)


# ── Routes ────────────────────────────────────────────────────────────────────

@api.api_route("/health", methods=["GET", "HEAD"])
async def health():
    # HEAD is used by uptime pingers that keep the free Render instance awake.
    return {"ok": True, "version": VERSION}


@api.get("/models")
async def list_models():
    models = await llm.catalog.list()
    default = config.DEFAULT_MODEL if any(m.id == config.DEFAULT_MODEL for m in models) else models[0].id
    return {"default": default, "models": [m.to_dict() for m in models]}


@api.post("/chat")
async def chat(body: ChatRequest, request: Request):
    last = body.messages[-1]
    if last.role != "user":
        raise HTTPException(400, "The last message must come from the user.")
    if not last.content.strip():
        raise HTTPException(400, "Message cannot be empty.")
    if len(last.content) > config.MAX_USER_MESSAGE_CHARS:
        raise HTTPException(400, f"Messages are limited to {config.MAX_USER_MESSAGE_CHARS:,} characters.")

    chat_limiter.check(client_ip(request))

    model_id = body.model or config.DEFAULT_MODEL
    model = await llm.catalog.get(model_id)
    if model is None:
        raise llm.LLMError(400, "model_unavailable", f"“{model_id}” isn't available on Groq right now. Pick another model.")

    memories = [" ".join(m.split())[: config.MAX_MEMORY_CHARS] for m in body.memories if m.strip()]
    passages = [p.model_dump() for p in body.context]
    system = llm.build_system_prompt(memories, passages)

    budget = model.context_window - llm.completion_budget(model.context_window) - llm.estimate_tokens(system)
    history, trimmed = llm.trim_history([m.model_dump() for m in body.messages], max(budget, 256))

    logger.info("chat model=%s messages=%d trimmed=%d memories=%d passages=%d",
                model.id, len(history), trimmed, len(memories), len(passages))

    stream = await llm.open_stream(model, [{"role": "system", "content": system}, *history], body.reasoning_effort)
    meta = {"model": model.id, "trimmed": trimmed}
    return StreamingResponse(
        llm.relay_stream(stream, meta),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


@api.post("/memory/extract")
async def extract_memory(body: MemoryRequest, request: Request):
    utility_limiter.check(client_ip(request))
    return await memory.extract(body.user, body.assistant, body.existing)


async def _read_upload(upload: UploadFile, limit: int) -> bytes:
    data = await upload.read(limit + 1)
    if len(data) > limit:
        raise HTTPException(413, f"File is too large (max {limit // (1024 * 1024)} MB).")
    if not data:
        raise HTTPException(400, "The file is empty.")
    return data


@api.post("/documents")
async def parse_document(request: Request, file: UploadFile = File(...)):
    utility_limiter.check(client_ip(request))
    name = os.path.basename(file.filename or "document.txt")[:200]
    data = await _read_upload(file, config.MAX_UPLOAD_BYTES)
    try:
        text = documents.extract_text(name, data)
    except documents.DocumentError as exc:
        raise HTTPException(400, str(exc)) from exc
    chunks = documents.chunk_text(text)
    return {"name": name, "chars": len(text), "chunks": chunks}


@api.post("/transcribe")
async def transcribe(request: Request, file: UploadFile = File(...)):
    utility_limiter.check(client_ip(request))
    data = await _read_upload(file, config.MAX_AUDIO_BYTES)
    try:
        result = await llm.get_client().audio.transcriptions.create(
            file=(os.path.basename(file.filename or "speech.webm"), data),
            model=config.TRANSCRIBE_MODEL,
            response_format="json",
        )
    except Exception as exc:
        raise llm.translate_error(exc) from exc
    return {"text": (getattr(result, "text", "") or "").strip()}


app.include_router(api)
