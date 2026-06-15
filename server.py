import os
import re
from datetime import timedelta

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from livekit import api
from pydantic import BaseModel, Field
from supabase import Client, create_client


load_dotenv()

ROOM_RE = re.compile(r"^[A-Za-z0-9_-]{3,80}$")
IDENTITY_RE = re.compile(r"^[A-Za-z0-9_.@-]{3,80}$")


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
    for line in transcript_log.splitlines():
        if not line.strip() or ": " not in line:
            continue

        role, text = line.split(": ", 1)
        role = role.strip().lower()
        if role == "agent":
            role = "assistant"
        elif role != "user":
            continue

        messages.append(Message(role=role, text=text.strip()))
    return messages


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

    result = (
        supabase_client()
        .table("chat_sessions")
        .select("transcript_log")
        .eq("channel_room", room_name)
        .execute()
    )
    if not result.data:
        return []

    return parse_transcript(result.data[0].get("transcript_log") or "")
