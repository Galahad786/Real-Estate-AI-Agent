import json
import threading
from datetime import datetime
from pathlib import Path
from typing import Any


MEMORY_FILE = Path(__file__).with_name(".conversation_memory.json")
_LOCK = threading.Lock()


def _read_store() -> dict[str, Any]:
    if not MEMORY_FILE.exists():
        return {"sessions": {}}

    try:
        with MEMORY_FILE.open("r", encoding="utf-8") as file:
            data = json.load(file)
    except Exception:
        return {"sessions": {}}

    if not isinstance(data, dict):
        return {"sessions": {}}
    if not isinstance(data.get("sessions"), dict):
        data["sessions"] = {}
    return data


def _write_store(data: dict[str, Any]) -> None:
    MEMORY_FILE.write_text(
        json.dumps(data, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )


def append_file_transcript(room_name: str, role: str, text: str) -> None:
    text = text.strip()
    if not text:
        return

    line = f"{role}: {text}"

    with _LOCK:
        data = _read_store()
        sessions = data.setdefault("sessions", {})
        session = sessions.setdefault(
            room_name,
            {
                "title": text[:60] if role == "User" else room_name,
                "transcript_log": "",
                "created_at": datetime.utcnow().isoformat(),
            },
        )

        current_log = session.get("transcript_log") or ""
        session["transcript_log"] = f"{current_log}\n{line}" if current_log else line
        if role == "User" and session.get("title") == room_name:
            session["title"] = text[:60]

        _write_store(data)


def get_file_transcript(room_name: str) -> str:
    with _LOCK:
        session = _read_store().get("sessions", {}).get(room_name)
        if not session:
            return ""
        return (session.get("transcript_log") or "").strip()


def list_file_conversations() -> list[dict[str, str]]:
    with _LOCK:
        sessions = _read_store().get("sessions", {})

    return [
        {
            "room_name": room_name,
            "title": session.get("title") or room_name,
            "created_at": session.get("created_at"),
        }
        for room_name, session in sorted(
            sessions.items(),
            key=lambda item: item[1].get("created_at", ""),
            reverse=True,
        )
    ]
