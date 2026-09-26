import json
import sys
from pathlib import Path
from types import SimpleNamespace as NS

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import llm  # noqa: E402
import server  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402


def chunk(content=None, reasoning=None, finish=None, usage=None):
    delta = NS(content=content, reasoning=reasoning)
    return NS(choices=[NS(delta=delta, finish_reason=finish)], x_groq=NS(usage=usage) if usage else None, usage=None)


class FakeStream:
    def __init__(self, chunks, fail_after=None):
        self.chunks = chunks
        self.fail_after = fail_after
        self.closed = False

    def __aiter__(self):
        return self._gen()

    async def _gen(self):
        for i, c in enumerate(self.chunks):
            if self.fail_after is not None and i == self.fail_after:
                raise RuntimeError("boom")
            yield c

    async def close(self):
        self.closed = True


class FakeGroq:
    """Stands in for AsyncGroq. Records every call so tests can assert on the prompt."""

    def __init__(self):
        self.calls = []
        self.models_data = [
            NS(id="openai/gpt-oss-120b", owned_by="OpenAI", context_window=131072, active=True),
            NS(id="qwen/qwen3.8-27b", owned_by="Alibaba Cloud", context_window=131072, active=True),
            NS(id="allam-2-7b", owned_by="SDAIA", context_window=4096, active=True),
            NS(id="whisper-large-v3", owned_by="OpenAI", context_window=448, active=True),
            NS(id="meta-llama/llama-prompt-guard-2-22m", owned_by="Meta", context_window=512, active=True),
        ]
        self.stream_chunks = [
            chunk(reasoning="Thinking…"),
            chunk(content="Hello"),
            chunk(content=" world"),
            chunk(finish="stop", usage=NS(prompt_tokens=10, completion_tokens=50, completion_time=0.1,
                                           completion_tokens_details=None)),
        ]
        self.stream_error = None
        self.fail_after = None
        self.json_reply = {"add": [], "remove": []}
        self.last_stream = None

        async def list_models():
            return NS(data=self.models_data)

        async def create(**kwargs):
            self.calls.append(kwargs)
            if self.stream_error:
                raise self.stream_error
            if kwargs.get("stream"):
                self.last_stream = FakeStream(self.stream_chunks, self.fail_after)
                return self.last_stream
            message = NS(content=json.dumps(self.json_reply))
            return NS(choices=[NS(message=message)])

        async def transcribe(**kwargs):
            self.calls.append(kwargs)
            return NS(text=" hello from audio ")

        self.models = NS(list=list_models)
        self.chat = NS(completions=NS(create=create))
        self.audio = NS(transcriptions=NS(create=transcribe))


@pytest.fixture
def fake():
    client = FakeGroq()
    llm.set_client(client)
    server.chat_limiter.reset()
    server.utility_limiter.reset()
    yield client
    llm.set_client(None)


@pytest.fixture
def api(fake):
    return TestClient(server.app)


def read_events(response):
    """Parse an SSE body into a list of (event, data) tuples."""
    events = []
    for block in response.text.strip().split("\n\n"):
        name, data = None, None
        for line in block.split("\n"):
            if line.startswith("event: "):
                name = line[7:]
            elif line.startswith("data: "):
                data = json.loads(line[6:])
        events.append((name, data))
    return events
