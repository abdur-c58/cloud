"""OpenAI-powered features: conversational library search + auto-tagging.

Everything degrades gracefully: when ``OPENAI_API_KEY`` is not set the endpoints
return a helpful message instead of failing, and a keyword fallback still powers
chat search.
"""

from __future__ import annotations

import json
from typing import Annotated, Any

from fastapi import APIRouter, Depends

from .. import db, r2
from ..config import settings
from ..locks import folder_token_header, locking_ancestor
from ..media import classify
from ..schemas import ChatRequest, ChatResponse, TagSuggestRequest
from ..security import CurrentUser, unlocked_folders
from ..user_scope import assert_owned, strip_user_root

router = APIRouter(prefix="/api/ai", tags=["ai"])

FolderToken = Annotated[str | None, Depends(folder_token_header)]

SYSTEM_PROMPT = (
    "You are the assistant for GigaChad Cloud, a personal media library of the "
    "user's own photos, videos and audio stored on Cloudflare R2. Help the user "
    "find, organise and understand their files. When the user asks to find or "
    "list media, call the search_library tool. Be concise and friendly. Refer to "
    "files by name. Never invent files that the tool did not return."
)

SEARCH_TOOL = {
    "type": "function",
    "function": {
        "name": "search_library",
        "description": "Search the user's media library by keyword, type and favorites.",
        "parameters": {
            "type": "object",
            "properties": {
                "query": {"type": "string", "description": "Keywords matched against file name, tags and captions."},
                "type": {
                    "type": "string",
                    "enum": ["image", "video", "audio"],
                    "description": "Optional media type filter.",
                },
                "favorites_only": {"type": "boolean"},
            },
        },
    },
}


def _run_search(
    user_id: str,
    query: str,
    type_: str | None,
    favorites: bool,
    folder_token: str | None,
) -> list[dict[str, Any]]:
    rows = db.search_items(
        user_id,
        query=query,
        types=[type_] if type_ else None,
        favorites_only=favorites,
        limit=30,
    )
    unlocked = unlocked_folders(folder_token, user_id)
    locked = db.list_locked_folders(user_id)
    items: list[dict[str, Any]] = []
    for row in rows:
        gate = locking_ancestor(row["key"], locked)
        if gate is not None and gate not in unlocked:
            continue
        items.append(
            {
                "key": strip_user_root(user_id, row["key"]),
                "name": row["name"],
                "type": row["type"],
                "folder": strip_user_root(user_id, row["folder"]),
                "tags": [t for t in row["tags"].split(",") if t],
            }
        )
    return items


def _keyword_fallback(
    user_id: str, messages: list[dict], folder_token: str | None
) -> ChatResponse:
    last = next((m["content"] for m in reversed(messages) if m["role"] == "user"), "")
    results = _run_search(user_id, last, None, False, folder_token)
    if results:
        names = ", ".join(r["name"] for r in results[:8])
        reply = (
            f"I found {len(results)} item(s) matching “{last}”: {names}. "
            "(Set OPENAI_API_KEY to enable full conversational answers.)"
        )
    else:
        reply = (
            f"I couldn't find anything matching “{last}”. Try different keywords, "
            "or run Reindex to refresh the library. (Set OPENAI_API_KEY for smarter chat.)"
        )
    return ChatResponse(reply=reply, results=results)


@router.post("/chat", response_model=ChatResponse)
async def chat(
    user: CurrentUser,
    folder_token: FolderToken,
    body: ChatRequest,
) -> ChatResponse:
    messages = [{"role": m.role, "content": m.content} for m in body.messages]

    if not settings.openai_configured:
        return _keyword_fallback(user.user_id, messages, folder_token)

    from openai import OpenAI

    client = OpenAI(api_key=settings.openai_api_key)
    convo: list[dict[str, Any]] = [{"role": "system", "content": SYSTEM_PROMPT}, *messages]
    collected: list[dict[str, Any]] = []

    for _step in range(4):
        completion = client.chat.completions.create(
            model=settings.openai_model,
            messages=convo,
            tools=[SEARCH_TOOL],
            temperature=0.3,
        )
        msg = completion.choices[0].message
        if not msg.tool_calls:
            return ChatResponse(reply=msg.content or "", results=collected)

        convo.append(
            {
                "role": "assistant",
                "content": msg.content or "",
                "tool_calls": [tc.model_dump() for tc in msg.tool_calls],
            }
        )
        for call in msg.tool_calls:
            args = json.loads(call.function.arguments or "{}")
            found = _run_search(
                user.user_id,
                args.get("query", ""),
                args.get("type"),
                bool(args.get("favorites_only")),
                folder_token,
            )
            collected = found
            convo.append(
                {
                    "role": "tool",
                    "tool_call_id": call.id,
                    "content": json.dumps([{"name": f["name"], "type": f["type"]} for f in found]),
                }
            )

    return ChatResponse(reply="Here is what I found in your library.", results=collected)


@router.post("/suggest-tags")
async def suggest_tags(
    user: CurrentUser,
    folder_token: FolderToken,
    body: TagSuggestRequest,
) -> dict:
    key = assert_owned(user.user_id, body.key)
    if classify(key) != "image":
        raise r2.StorageError("Auto-tagging is currently available for images only.")
    if not settings.openai_configured:
        return {"tags": [], "caption": "", "message": "Set OPENAI_API_KEY to enable auto-tagging."}

    from openai import OpenAI

    client = OpenAI(api_key=settings.openai_api_key)
    url = r2.presign_get(key, download=False)
    completion = client.chat.completions.create(
        model=settings.openai_model,
        messages=[
            {
                "role": "user",
                "content": [
                    {
                        "type": "text",
                        "text": (
                            "Describe this image in one short caption and give 3-8 lowercase "
                            'tags. Respond as JSON: {"caption": str, "tags": [str]}.'
                        ),
                    },
                    {"type": "image_url", "image_url": {"url": url}},
                ],
            }
        ],
        response_format={"type": "json_object"},
        temperature=0.2,
    )
    raw = completion.choices[0].message.content or "{}"
    try:
        data = json.loads(raw)
    except json.JSONDecodeError:
        data = {"caption": "", "tags": []}
    tags = [str(t).strip().lower() for t in data.get("tags", []) if str(t).strip()]
    caption = str(data.get("caption", "")).strip()
    db.set_tags(user.user_id, key, ",".join(sorted(set(tags))), caption)
    return {"tags": tags, "caption": caption}
