"""Long-term memory: decide which durable facts about the user an exchange reveals.

Memories live in the user's browser; this module only proposes additions and removals.
"""

import config
import llm

EXTRACTION_PROMPT = """You maintain a short list of long-term facts about a user of a chat assistant.
Read the latest exchange and decide whether it reveals durable facts worth remembering in future
conversations: name, job, location, skills, projects, goals, preferences, tools they use.

Rules:
- Only facts about the user, stated or clearly implied by the user. Never facts about the world.
- Ignore one-off requests, questions and temporary context ("help me fix this bug").
- One short third-person sentence per fact, e.g. "Works as a data engineer in Lyon."
- Don't add a fact that is already in the existing list, even reworded.
- If the user corrects or retracts an existing fact, put that exact existing string in "remove".
- Most exchanges reveal nothing: then return empty lists.

Reply with JSON only: {"add": ["..."], "remove": ["..."]}"""


def _clean(items, limit: int) -> list[str]:
    if not isinstance(items, list):
        return []
    out = []
    for item in items:
        if isinstance(item, str):
            text = " ".join(item.split())[: config.MAX_MEMORY_CHARS]
            if text:
                out.append(text)
    return out[:limit]


async def extract(user_message: str, assistant_message: str, existing: list[str]) -> dict:
    listing = "\n".join(f"- {m}" for m in existing) or "(empty)"
    prompt = (
        f"Existing facts:\n{listing}\n\n"
        f"Latest exchange:\nUSER: {user_message[:4000]}\nASSISTANT: {assistant_message[:2000]}"
    )
    data = await llm.complete_json(config.UTILITY_MODEL, EXTRACTION_PROMPT, prompt)

    known = {m.casefold() for m in existing}
    add = []
    for fact in _clean(data.get("add"), 5):
        if fact.casefold() not in known:
            known.add(fact.casefold())
            add.append(fact)
    existing_set = set(existing)
    remove = [m for m in _clean(data.get("remove"), 10) if m in existing_set]
    return {"add": add, "remove": remove}
