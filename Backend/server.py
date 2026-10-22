import os
import re
import threading
import time
from datetime import datetime
from datetime import timedelta

import requests
from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from livekit import api
from pydantic import BaseModel, Field
from supabase import Client, create_client

from conversation_store import (
    append_file_transcript,
    get_file_transcript,
    list_file_conversations,
)


load_dotenv()

ROOM_RE = re.compile(r"^[A-Za-z0-9_-]{3,80}$")
IDENTITY_RE = re.compile(r"^[A-Za-z0-9_.@-]{3,80}$")
PROPERTY_CONTEXT_TTL_SECONDS = 300
_property_context_cache: dict[str, float | str] = {"value": "", "expires_at": 0.0}


class TokenRequest(BaseModel):
    room_name: str = Field(..., min_length=3, max_length=80)
    identity: str = Field(..., min_length=3, max_length=80)
    name: str | None = Field(default=None, max_length=80)


class TokenResponse(BaseModel):
    token: str
    url: str
    room_name: str
    identity: str


class Message(BaseModel):
    role: str
    text: str


class ChatRequest(BaseModel):
    room_name: str = Field(..., min_length=3, max_length=80)
    message: str = Field(..., min_length=1)
    history: list[Message] = Field(default_factory=list)


memory_sessions: dict[str, dict[str, str]] = {}


def require_env(name: str) -> str:
    value = os.getenv(name)
    if not value:
        raise RuntimeError(f"Missing required environment variable: {name}")
    return value


def supabase_client() -> Client:
    return create_client(
        require_env("SUPABASE_URL"),
        require_env("SUPABASE_SERVICE_ROLE_KEY"),
    )


def parse_transcript(transcript_log: str) -> list[Message]:
    messages: list[Message] = []
    current: Message | None = None

    for line in transcript_log.splitlines():
        if not line.strip():
            continue

        if ": " in line:
            role, text = line.split(": ", 1)
            role = role.strip().lower()
            if role == "agent":
                role = "assistant"
            elif role != "user":
                if current:
                    current.text = f"{current.text}\n{line}".strip()
                continue

            current = Message(role=role, text=text.strip())
            messages.append(current)
            continue

        if current:
            current.text = f"{current.text}\n{line}".strip()

    return messages


def dedupe_messages(messages: list[Message]) -> list[Message]:
    cleaned: list[Message] = []
    for message in messages:
        text = " ".join(message.text.split())
        if not text:
            continue
        if cleaned and cleaned[-1].role == message.role and " ".join(cleaned[-1].text.split()) == text:
            continue
        if (
            cleaned
            and cleaned[-1].role != message.role
            and len(text) > 30
            and " ".join(cleaned[-1].text.split()) == text
        ):
            if message.role == "assistant":
                cleaned[-1] = message
            continue
        cleaned.append(message)
    return cleaned


def append_transcript(room_name: str, role: str, text: str) -> None:
    line = f"{role}: {text.strip()}"

    try:
        client = supabase_client()
        result = (
            client.table("chat_sessions")
            .select("transcript_log, title")
            .eq("channel_room", room_name)
            .execute()
        )

        if result.data:
            current_log = result.data[0].get("transcript_log") or ""
            update = {
                "transcript_log": f"{current_log}\n{line}" if current_log else line,
            }
            if role == "User" and not result.data[0].get("title"):
                update["title"] = text.strip()[:60]

            (
                client.table("chat_sessions")
                .update(update)
                .eq("channel_room", room_name)
                .execute()
            )
            return

        (
            client.table("chat_sessions")
            .insert(
                {
                    "channel_room": room_name,
                    "title": text.strip()[:60] if role == "User" else room_name,
                    "transcript_log": line,
                }
            )
            .execute()
        )
        return
    except Exception:
        # Single fallback write via the file store, then mirror into memory.
        append_file_transcript(room_name, role, text)
        session = memory_sessions.setdefault(
            room_name,
            {
                "title": text.strip()[:60] if role == "User" else room_name,
                "transcript_log": "",
                "created_at": datetime.utcnow().isoformat(),
            },
        )
        session["transcript_log"] = get_file_transcript(room_name)
        if role == "User" and (
            not session.get("title") or session.get("title") == room_name
        ):
            session["title"] = text.strip()[:60]


def memory_conversations() -> list[dict[str, str]]:
    conversations = [
        {
            "room_name": room_name,
            "title": session.get("title") or room_name,
            "created_at": session.get("created_at"),
        }
        for room_name, session in sorted(
            memory_sessions.items(),
            key=lambda item: item[1].get("created_at", ""),
            reverse=True,
        )
    ]
    seen = {conversation["room_name"] for conversation in conversations}
    conversations.extend(
        conversation
        for conversation in list_file_conversations()
        if conversation["room_name"] not in seen
    )
    return conversations


def memory_history(room_name: str) -> list[Message]:
    # Prefer a single source. append_transcript's fallback writes the same
    # lines to both memory_sessions and the file — concatenating them
    # duplicated every exchange in the UI.
    session = memory_sessions.get(room_name)
    transcript = (session.get("transcript_log") if session else "") or ""
    source = transcript.strip() or get_file_transcript(room_name)
    return dedupe_messages(parse_transcript(source))


def _message_key(message: Message) -> tuple[str, str]:
    return (message.role, " ".join(message.text.split()))


def merge_memory_history(room_name: str, messages: list[Message]) -> list[Message]:
    memory_messages = memory_history(room_name)
    if not memory_messages:
        return dedupe_messages(messages)
    if not messages:
        return memory_messages

    existing = {_message_key(message) for message in messages}
    extras = [
        message
        for message in memory_messages
        if _message_key(message) not in existing
    ]
    return dedupe_messages([*messages, *extras])


def load_property_context() -> str:
    now = time.time()
    cached = str(_property_context_cache.get("value") or "")
    expires_at = float(_property_context_cache.get("expires_at") or 0.0)
    if cached and expires_at > now:
        return cached

    try:
        client = supabase_client()
        insights = client.table("property_insights").select("*").execute()
        prices = client.table("property_prices").select("*").execute()
    except Exception:
        _property_context_cache["value"] = cached
        _property_context_cache["expires_at"] = now + 30
        return cached

    lines = ["PROPERTY INSIGHTS:"]
    for row in insights.data or []:
        lines.append(
            "Sector: {sector}, Category: {category}, Average Price Range: {price}".format(
                sector=row.get("sector_name", ""),
                category=row.get("tier_category", ""),
                price=row.get("average_price_range", ""),
            )
        )

    lines.append("PROPERTY PRICES:")
    for row in prices.data or []:
        lines.append(
            "Sector: {sector}, Type: {kind}, Size: {size}, Price Range: {price}".format(
                sector=row.get("sector_name", ""),
                kind=row.get("property_type", ""),
                size=row.get("property_size", ""),
                price=row.get("price_range", ""),
            )
        )

    value = "\n".join(lines)
    _property_context_cache["value"] = value
    _property_context_cache["expires_at"] = now + PROPERTY_CONTEXT_TTL_SECONDS
    return value


def load_room_messages(room_name: str) -> list[Message]:
    try:
        result = (
            supabase_client()
            .table("chat_sessions")
            .select("transcript_log")
            .eq("channel_room", room_name)
            .execute()
        )
        if not result.data:
            return memory_history(room_name)
        return merge_memory_history(
            room_name,
            parse_transcript(result.data[0].get("transcript_log") or ""),
        )
    except Exception:
        return memory_history(room_name)


def deepseek_messages(room_name: str, message: str, history: list[Message]) -> list[dict[str, str]]:
    context = load_property_context()
    system = (
        "You are a helpful Islamabad real estate AI assistant for buyers, renters, sellers, "
        "and agents. Be conversational, concise, and practical. Never invent live "
        "listings, prices, legal advice, mortgage approvals, or guarantees. Use polished "
        "plain text only. Do not use Markdown symbols, asterisks, headings, bullet "
        "markers, numbered lists, tables, or bold/italic formatting. Prefer short "
        "paragraphs and simple label-style lines like Category: Ultra-Premium. Do not "
        "greet, introduce yourself, or say welcome back during an ongoing room. If the "
        "latest user message is a real question or continuation, answer it directly. "
        "Use English greetings only, such as Hi, Hello, or Hey. Do not say "
        "Assalamualaikum, Assalam-o-Alaikum, Waalikumasalam, or similar greetings. "
        "Only give a brief English greeting when the latest user message is only a "
        "greeting and there is no useful prior room history."
    )
    if context:
        system = f"{system}\n\nUse this verified property context when relevant:\n{context}"

    messages = [{"role": "system", "content": system}]
    # Prefer the history the client already has so we do not block on Supabase
    # before the first streamed token.
    usable_history = history[-10:] if history else load_room_messages(room_name)[-10:]

    for item in usable_history:
        role = "assistant" if item.role == "assistant" else "user"
        if item.text.strip():
            messages.append({"role": role, "content": item.text.strip()})

    if not any(item.text == message and item.role == "user" for item in usable_history[-1:]):
        messages.append({"role": "user", "content": message})

    return messages


def append_transcript_async(room_name: str, role: str, text: str) -> None:
    threading.Thread(
        target=append_transcript,
        args=(room_name, role, text),
        daemon=True,
    ).start()


app = FastAPI(title="Real Estate AI Backend")

frontend_origin = os.getenv("FRONTEND_ORIGIN", "*")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"] if frontend_origin == "*" else [frontend_origin],
    allow_credentials=False,
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["*"],
)


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.post("/api/livekit-token", response_model=TokenResponse)
def create_livekit_token(request: TokenRequest) -> TokenResponse:
    room_name = request.room_name.strip()
    identity = request.identity.strip()

    if not ROOM_RE.match(room_name):
        raise HTTPException(status_code=400, detail="Invalid room_name")
    if not IDENTITY_RE.match(identity):
        raise HTTPException(status_code=400, detail="Invalid identity")

    token = (
        api.AccessToken(
            api_key=require_env("LIVEKIT_API_KEY"),
            api_secret=require_env("LIVEKIT_API_SECRET"),
        )
        .with_identity(identity)
        .with_name(request.name or identity)
        .with_ttl(timedelta(hours=6))
        .with_grants(
            api.VideoGrants(
                room_join=True,
                room=room_name,
                can_publish=True,
                can_subscribe=True,
                can_publish_data=True,
            )
        )
        .to_jwt()
    )

    return TokenResponse(
        token=token,
        url=require_env("LIVEKIT_URL"),
        room_name=room_name,
        identity=identity,
    )


@app.get("/api/history/{room_name}", response_model=list[Message])
def get_history(room_name: str) -> list[Message]:
    if not ROOM_RE.match(room_name):
        raise HTTPException(status_code=400, detail="Invalid room_name")

    try:
        result = (
            supabase_client()
            .table("chat_sessions")
            .select("transcript_log")
            .eq("channel_room", room_name)
            .execute()
        )
        if not result.data:
            return memory_history(room_name)

        return merge_memory_history(
            room_name,
            parse_transcript(result.data[0].get("transcript_log") or ""),
        )
    except Exception:
        return memory_history(room_name)


@app.post("/api/chat")
def chat(request: ChatRequest):
    room_name = request.room_name.strip()
    message = request.message.strip()

    if not ROOM_RE.match(room_name):
        raise HTTPException(status_code=400, detail="Invalid room_name")
    if not message:
        raise HTTPException(status_code=400, detail="Message cannot be empty")

    # Persist in the background so Supabase/file I/O does not delay first token.
    append_transcript_async(room_name, "User", message)

    def stream_response():
        assistant_text = ""
        try:
            payload = {
                "model": os.getenv("DEEPSEEK_MODEL", "deepseek-chat"),
                "messages": deepseek_messages(room_name, message, request.history),
                "stream": True,
                "temperature": 0.4,
            }

            with requests.post(
                "https://api.deepseek.com/chat/completions",
                headers={
                    "Authorization": f"Bearer {require_env('DEEPSEEK_API_KEY')}",
                    "Content-Type": "application/json",
                },
                json=payload,
                stream=True,
                timeout=90,
            ) as response:
                response.raise_for_status()

                for raw_line in response.iter_lines(decode_unicode=True):
                    if not raw_line or not raw_line.startswith("data: "):
                        continue

                    data = raw_line.removeprefix("data: ").strip()
                    if data == "[DONE]":
                        break

                    try:
                        import json

                        chunk = json.loads(data)
                        delta = (
                            chunk.get("choices", [{}])[0]
                            .get("delta", {})
                            .get("content", "")
                        )
                    except Exception:
                        delta = ""

                    if delta:
                        assistant_text += delta
                        yield delta

            if assistant_text.strip():
                append_transcript_async(room_name, "Agent", assistant_text)

        except Exception:
            yield (
                "I am having trouble reaching the AI service right now. "
                "Please try again in a moment."
            )

    return StreamingResponse(stream_response(), media_type="text/plain")


@app.get("/api/conversations")
def get_conversations():
    try:
        result = (
            supabase_client()
            .table("chat_sessions")
            .select("channel_room, title, created_at")
            .order("created_at", desc=True)
            .execute()
        )

        conversations = []

        for row in result.data:
            room = row.get("channel_room")

            title = row.get("title") or room

            conversations.append({
                "room_name": room,
                "title": title,
                "created_at": row.get("created_at"),
            })

        if conversations:
            return conversations
    except Exception:
        pass

    return memory_conversations()
