from fastapi import FastAPI, APIRouter, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv
from pathlib import Path
from pydantic import BaseModel
from typing import List, Optional
from groq import Groq
import os
import uuid
import logging
from datetime import datetime

# ── Setup ─────────────────────────────────────────────────────────────────────

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

client = Groq(api_key=os.environ["GROQ_API_KEY"])

SYSTEM_PROMPT = (
    "You are Aiolio, a sharp and concise AI assistant. "
    "You answer clearly and directly, without unnecessary filler. "
    "When answering code questions, always include a working example. "
    "If you don't know something, say so — don't make things up. "
    "Format code using markdown code blocks with the language specified."
)

# ── In-memory session store ───────────────────────────────────────────────────

sessions = {}

# ── App setup ─────────────────────────────────────────────────────────────────

app = FastAPI()
api_router = APIRouter(prefix="/api")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# ── Pydantic models ───────────────────────────────────────────────────────────

class CreateSessionRequest(BaseModel):
    name: Optional[str] = None

class ChatRequest(BaseModel):
    message: str

class MessageOut(BaseModel):
    role: str
    content: str
    timestamp: str

class SessionOut(BaseModel):
    id: str
    name: str
    message_count: int
    created_at: str

# ── Helper ────────────────────────────────────────────────────────────────────

def now() -> str:
    return datetime.utcnow().strftime("%I:%M %p")

# ── Routes ────────────────────────────────────────────────────────────────────

@api_router.get("/health")
async def health():
    return {"ok": True}


@api_router.get("/sessions", response_model=List[SessionOut])
async def get_sessions():
    return [
        SessionOut(
            id=sid,
            name=s["name"],
            message_count=len(s["messages"]),
            created_at=s["created_at"]
        )
        for sid, s in sessions.items()
    ]


@api_router.post("/sessions", response_model=SessionOut)
async def create_session(body: CreateSessionRequest):
    sid = str(uuid.uuid4())
    name = body.name or f"Chat {len(sessions) + 1}"
    sessions[sid] = {
        "name": name,
        "messages": [],
        "created_at": now()
    }
    return SessionOut(id=sid, name=name, message_count=0, created_at=sessions[sid]["created_at"])


@api_router.delete("/sessions/{session_id}")
async def delete_session(session_id: str):
    if session_id not in sessions:
        raise HTTPException(status_code=404, detail="Session not found")
    del sessions[session_id]
    return {"ok": True}


@api_router.get("/sessions/{session_id}/messages", response_model=List[MessageOut])
async def get_messages(session_id: str):
    if session_id not in sessions:
        raise HTTPException(status_code=404, detail="Session not found")
    return sessions[session_id]["messages"]


@api_router.post("/sessions/{session_id}/chat")
async def chat(session_id: str, body: ChatRequest):
    if session_id not in sessions:
        raise HTTPException(status_code=404, detail="Session not found")

    message = body.message.strip()
    if not message:
        raise HTTPException(status_code=400, detail="Message cannot be empty")

    session = sessions[session_id]

    # Auto-name session from first message
    if len(session["messages"]) == 0:
        session["name"] = message[:40] + ("…" if len(message) > 40 else "")

    # Save user message to history
    session["messages"].append({
        "role": "user",
        "content": message,
        "timestamp": now()
    })

    try:
        # Build history for Groq — same format as OpenAI
        history = [
            {"role": m["role"], "content": m["content"]}
            for m in session["messages"][:-1]
        ]

        response = client.chat.completions.create(
            model="llama-3.3-70b-versatile",
            messages=[
                {"role": "system", "content": SYSTEM_PROMPT},
                *history,
                {"role": "user", "content": message}
            ]
        )
        reply = response.choices[0].message.content

    except Exception as e:
        session["messages"].pop()
        logger.error(f"Groq error: {e}")
        raise HTTPException(status_code=500, detail=f"AI request failed: {str(e)}")

    session["messages"].append({
        "role": "assistant",
        "content": reply,
        "timestamp": now()
    })

    return {"reply": reply}


# ── Register router ───────────────────────────────────────────────────────────

app.include_router(api_router)