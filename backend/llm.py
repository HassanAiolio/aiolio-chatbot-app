"""Groq integration: model catalog, prompt assembly, history trimming and streaming."""

import asyncio
import json
import logging
import re
import time
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import AsyncIterator

import groq
from groq import AsyncGroq

import config

logger = logging.getLogger("aiolio.llm")

_client: AsyncGroq | None = None


def get_client() -> AsyncGroq:
    global _client
    if _client is None:
        if not config.GROQ_API_KEY:
            raise RuntimeError("GROQ_API_KEY is not set")
        _client = AsyncGroq(api_key=config.GROQ_API_KEY)
    return _client


def set_client(client) -> None:
    """Swap the client (used by tests)."""
    global _client
    _client = client
    catalog.clear()


# ── Model catalog ─────────────────────────────────────────────────────────────

# Anything that isn't a chat model: speech, TTS, safety classifiers.
_NON_CHAT = re.compile(r"whisper|guard|safeguard|orpheus|tts|playai", re.IGNORECASE)

_KNOWN_MODELS = {
    "openai/gpt-oss-120b": ("GPT-OSS 120B", "Best quality · shows its reasoning"),
    "openai/gpt-oss-20b": ("GPT-OSS 20B", "Faster reasoning model"),
    "qwen/qwen3.8-27b": ("Qwen 3.8 27B", "Very fast · direct answers"),
    "allam-2-7b": ("ALLaM 2 7B", "Small · Arabic & English"),
    "llama-3.3-70b-versatile": ("Llama 3.3 70B", "General purpose"),
    "llama-3.1-8b-instant": ("Llama 3.1 8B", "Tiny and instant"),
}


@dataclass
class ModelInfo:
    id: str
    label: str
    description: str
    context_window: int
    owned_by: str
    reasoning: bool

    def to_dict(self) -> dict:
        return self.__dict__.copy()


def supports_reasoning_effort(model_id: str) -> bool:
    return "gpt-oss" in model_id


def _describe(model_id: str, owned_by: str, context_window: int) -> ModelInfo:
    label, description = _KNOWN_MODELS.get(model_id, (None, None))
    if label is None:
        label = model_id.split("/")[-1].replace("-", " ").title()
        description = f"{owned_by}".strip() or "Groq model"
    return ModelInfo(
        id=model_id,
        label=label,
        description=description,
        context_window=context_window or 8_192,
        owned_by=owned_by,
        reasoning=supports_reasoning_effort(model_id),
    )


def _sort_key(model: ModelInfo):
    known_order = list(_KNOWN_MODELS)
    return (
        model.id != config.DEFAULT_MODEL,
        known_order.index(model.id) if model.id in known_order else len(known_order),
        model.id,
    )


class ModelCatalog:
    """Asks Groq which models exist and caches the answer, so retired models never show up."""

    ttl_seconds = 600

    def __init__(self):
        self._models: list[ModelInfo] = []
        self._fetched_at = 0.0
        self._lock = asyncio.Lock()

    def clear(self) -> None:
        self._models = []
        self._fetched_at = 0.0

    async def list(self) -> list[ModelInfo]:
        if self._models and time.monotonic() - self._fetched_at < self.ttl_seconds:
            return self._models
        async with self._lock:
            if self._models and time.monotonic() - self._fetched_at < self.ttl_seconds:
                return self._models
            try:
                response = await get_client().models.list()
                models = [
                    _describe(m.id, getattr(m, "owned_by", "") or "", getattr(m, "context_window", 0) or 0)
                    for m in response.data
                    if getattr(m, "active", True) and not _NON_CHAT.search(m.id)
                ]
                if models:
                    self._models = sorted(models, key=_sort_key)
                    self._fetched_at = time.monotonic()
            except Exception as exc:  # network, auth… keep serving whatever we had
                logger.warning("Could not refresh the model list: %s", exc)
            if not self._models:
                return [_describe(config.DEFAULT_MODEL, "", 131_072)]
            return self._models

    async def get(self, model_id: str) -> ModelInfo | None:
        return next((m for m in await self.list() if m.id == model_id), None)


catalog = ModelCatalog()


# ── Prompt assembly ───────────────────────────────────────────────────────────

PERSONA = (
    "You are Aiolio, a sharp and concise AI assistant — the user's second brain. "
    "Answer clearly and directly, without filler. "
    "When answering code questions, include a working example in a fenced code block with the language set. "
    "Use Markdown (headings, lists, tables) when it makes the answer easier to scan. "
    "If you don't know something, say so — don't make things up."
)


def build_system_prompt(memories: list[str], passages: list[dict]) -> str:
    today = datetime.now(timezone.utc).strftime("%A %d %B %Y")
    parts = [PERSONA, f"Today's date is {today}."]

    if memories:
        facts = "\n".join(f"- {m}" for m in memories)
        parts.append(
            "Things you remember about the user from earlier conversations. "
            "Use them when relevant, never recite them unprompted:\n" + facts
        )

    if passages:
        blocks = "\n\n".join(
            f"[{i}] (from \"{p['source']}\")\n{p['text']}" for i, p in enumerate(passages, start=1)
        )
        parts.append(
            "Excerpts from documents the user uploaded. If they help answer the question, "
            "rely on them and cite them inline like [1] or [2]. If they are irrelevant, ignore them "
            "and do not mention them.\n\n" + blocks
        )

    return "\n\n".join(parts)


# ── History trimming ──────────────────────────────────────────────────────────

def estimate_tokens(text: str) -> int:
    # ~3.5 characters per token for English prose and code; slightly pessimistic on purpose.
    return int(len(text) / 3.5) + 4


def completion_budget(context_window: int) -> int:
    return min(config.MAX_COMPLETION_TOKENS * 2, context_window // 2)


def trim_history(messages: list[dict], budget_tokens: int) -> tuple[list[dict], int]:
    """Keep the most recent messages that fit in `budget_tokens`.

    The latest message is always kept (its head is cut if it alone is too long).
    Returns the kept messages and how many older ones were dropped.
    """
    if not messages:
        return [], 0

    kept: list[dict] = []
    used = 0
    for message in reversed(messages):
        cost = estimate_tokens(message["content"])
        if kept and used + cost > budget_tokens:
            break
        if not kept and cost > budget_tokens:
            keep_chars = max(200, int(budget_tokens * 3.5) - 50)
            message = {**message, "content": "…" + message["content"][-keep_chars:]}
            cost = estimate_tokens(message["content"])
        kept.append(message)
        used += cost

    kept.reverse()
    # Chat APIs expect the conversation to start with the user.
    while len(kept) > 1 and kept[0]["role"] != "user":
        kept.pop(0)
    return kept, len(messages) - len(kept)


# ── Errors ────────────────────────────────────────────────────────────────────

class LLMError(Exception):
    def __init__(self, status: int, code: str, message: str):
        super().__init__(message)
        self.status = status
        self.code = code
        self.message = message


def translate_error(exc: Exception) -> LLMError:
    """Turn SDK exceptions into messages that are safe and useful to show a user."""
    if isinstance(exc, LLMError):
        return exc
    if isinstance(exc, groq.RateLimitError):
        return LLMError(429, "rate_limited", "This model is at its rate limit right now. Wait a moment or pick another model.")
    if isinstance(exc, groq.AuthenticationError):
        return LLMError(502, "upstream_auth", "The server's Groq API key was rejected.")
    if isinstance(exc, groq.NotFoundError):
        return LLMError(400, "model_unavailable", "That model is no longer available on Groq. Pick another one.")
    if isinstance(exc, groq.BadRequestError):
        body = getattr(exc, "body", None)
        error = body.get("error", body) if isinstance(body, dict) else {}
        code = str(error.get("code", "") if isinstance(error, dict) else "")
        text = str(exc).lower()
        if code in ("model_decommissioned", "model_not_found") or "decommission" in text or "does not exist" in text:
            return LLMError(400, "model_unavailable", "That model is no longer available on Groq. Pick another one.")
        if "context_length" in code or "context length" in text or "too long" in text:
            return LLMError(400, "context_too_long", "This conversation is too long for the selected model. Start a new chat or pick a model with a larger context.")
        return LLMError(400, "bad_request", "Groq rejected the request.")
    if isinstance(exc, (groq.APIConnectionError, groq.APITimeoutError)):
        return LLMError(503, "upstream_unreachable", "Couldn't reach Groq. Try again in a few seconds.")
    if isinstance(exc, groq.APIStatusError) and exc.status_code >= 500:
        return LLMError(503, "upstream_error", "Groq is having trouble right now. Try again shortly.")
    return LLMError(500, "internal", "Something went wrong while generating the reply.")


# ── Streaming ─────────────────────────────────────────────────────────────────

def sse(event: str, data: dict) -> str:
    return f"event: {event}\ndata: {json.dumps(data, ensure_ascii=False)}\n\n"


async def open_stream(model: ModelInfo, messages: list[dict], reasoning_effort: str | None):
    """Start the Groq request. Raises LLMError before any byte is sent to the client."""
    kwargs = {}
    if model.reasoning and reasoning_effort:
        kwargs["reasoning_effort"] = reasoning_effort
    try:
        return await get_client().chat.completions.create(
            model=model.id,
            messages=messages,
            stream=True,
            max_completion_tokens=completion_budget(model.context_window),
            **kwargs,
        )
    except Exception as exc:
        error = translate_error(exc)
        logger.warning("Groq request failed (%s): %s", error.code, exc)
        raise error from exc


async def relay_stream(stream, meta: dict) -> AsyncIterator[str]:
    """Forward Groq chunks as server-sent events: meta → reasoning/token… → done | error."""
    yield sse("meta", meta)
    started = time.perf_counter()
    first_token_at = None
    usage = None
    finish_reason = None
    try:
        async for chunk in stream:
            x_groq = getattr(chunk, "x_groq", None)
            if x_groq is not None and getattr(x_groq, "usage", None) is not None:
                usage = x_groq.usage
            if getattr(chunk, "usage", None) is not None:
                usage = chunk.usage
            if not chunk.choices:
                continue
            choice = chunk.choices[0]
            finish_reason = choice.finish_reason or finish_reason
            delta = choice.delta
            reasoning = getattr(delta, "reasoning", None)
            if reasoning:
                yield sse("reasoning", {"t": reasoning})
            if delta.content:
                if first_token_at is None:
                    first_token_at = time.perf_counter()
                yield sse("token", {"t": delta.content})
    except asyncio.CancelledError:
        # The browser pressed "stop" or went away; nothing left to send.
        raise
    except Exception as exc:
        error = translate_error(exc)
        logger.warning("Stream interrupted (%s): %s", error.code, exc)
        yield sse("error", {"code": error.code, "message": error.message})
        return
    finally:
        close = getattr(stream, "close", None)
        if close is not None:
            try:
                await close()
            except Exception:
                pass

    elapsed = time.perf_counter() - started
    stats = {
        "finish_reason": finish_reason,
        "truncated": finish_reason == "length",
        "elapsed_ms": round(elapsed * 1000),
        "ttft_ms": round((first_token_at - started) * 1000) if first_token_at else None,
    }
    if usage is not None:
        completion_tokens = getattr(usage, "completion_tokens", None) or 0
        completion_time = getattr(usage, "completion_time", None) or 0
        details = getattr(usage, "completion_tokens_details", None)
        stats.update(
            prompt_tokens=getattr(usage, "prompt_tokens", None),
            completion_tokens=completion_tokens,
            reasoning_tokens=getattr(details, "reasoning_tokens", None) if details else None,
            tokens_per_second=round(completion_tokens / completion_time) if completion_time else None,
        )
    yield sse("done", stats)


async def complete_json(model_id: str, system: str, user: str) -> dict:
    """One-shot JSON completion for background jobs (memory extraction)."""
    kwargs = {"reasoning_effort": "low"} if supports_reasoning_effort(model_id) else {}
    try:
        response = await get_client().chat.completions.create(
            model=model_id,
            messages=[{"role": "system", "content": system}, {"role": "user", "content": user}],
            response_format={"type": "json_object"},
            temperature=0.2,
            max_completion_tokens=1_024,
            **kwargs,
        )
    except Exception as exc:
        raise translate_error(exc) from exc
    content = response.choices[0].message.content or "{}"
    try:
        data = json.loads(content)
    except json.JSONDecodeError:
        logger.warning("Utility model returned invalid JSON: %.200s", content)
        return {}
    return data if isinstance(data, dict) else {}
