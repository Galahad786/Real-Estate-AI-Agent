import logging
import os
import threading
from typing import Any

from dotenv import load_dotenv
from livekit.agents.voice import room_io
from livekit.agents import (
    Agent,
    AgentServer,
    AgentSession,
    ChatContext,
    ConversationItemAddedEvent,
    JobContext,
    cli,
)
from livekit.plugins import deepgram, dtln, openai, silero
from supabase import Client, create_client

from conversation_store import append_file_transcript, get_file_transcript


load_dotenv()

logging.basicConfig(level=logging.INFO)

# Hide noisy HTTP logs
logging.getLogger("httpx").setLevel(logging.WARNING)
logging.getLogger("httpcore").setLevel(logging.WARNING)
logging.getLogger("hpack").setLevel(logging.WARNING)

logger = logging.getLogger("real-estate-ai-agent")


SYSTEM_PROMPT = """
You are a helpful Islamabad real estate AI assistant for buyers, renters, sellers, and agents.

Your style:
- Be conversational, concise, and practical.
- Use polished plain text only. Do not use Markdown symbols, asterisks, headings,
  bullet markers, numbered lists, tables, or bold/italic formatting.
- Prefer short paragraphs and simple label-style lines like "Category: Ultra-Premium".
- Do not greet, introduce yourself, or say welcome back during an ongoing room.
- If the latest user message is a real question or continuation, answer it directly.
- Use English greetings only, such as "Hi", "Hello", or "Hey". Do not say
  "Assalamualaikum", "Assalam-o-Alaikum", "Waalikumasalam", or similar greetings.
- Only give a brief English greeting when the user's latest message is only a greeting
  and there is no useful prior room history.
- Ask one or two focused follow-up questions when the user has not provided enough detail.
- Remember facts from the current room history, such as budget, city, preferred areas,
  bedrooms, property type, financing needs, timeline, and previous recommendations.
- Never invent live listings, prices, legal advice, mortgage approvals, or guarantees.
- If the user asks for market, legal, tax, or financing decisions, explain that they
  should verify with a licensed local professional before acting.
- For real estate searches, focus on Islamabad and collect sector/location, budget, buy/rent, bedrooms, property type,
  must-have features, and timeline.
""".strip()


REQUIRED_ENV_VARS = (
    "SUPABASE_URL",
    "SUPABASE_SERVICE_ROLE_KEY",
    "DEEPGRAM_API_KEY",
    "DEEPSEEK_API_KEY",
)

supabase: Client | None = None
server = AgentServer()


def require_env(name: str) -> str:
    value = (os.getenv(name) or "").strip()
    if not value:
        raise RuntimeError(f"Missing required environment variable: {name}")
    return value


def init_supabase() -> Client:
    return create_client(
        require_env("SUPABASE_URL"),
        require_env("SUPABASE_SERVICE_ROLE_KEY"),
    )


def validate_environment() -> None:
    for name in REQUIRED_ENV_VARS:
        require_env(name)


def get_supabase() -> Client:
    global supabase
    if supabase is None:
        supabase = init_supabase()
    return supabase


def message_text(item: Any) -> str:
    content = getattr(item, "content", "")
    if isinstance(content, str):
        return content.strip()
    if isinstance(content, list):
        return " ".join(str(part) for part in content if part).strip()
    return str(content).strip()

def generate_chat_title(text: str) -> str:
    try:
        llm = openai.LLM.with_deepseek(
            model=os.getenv("DEEPSEEK_MODEL", "deepseek-chat")
        )

        response = llm.complete(
            f"""
Generate a 4-6 word specific title for a real estate conversation 
that started with: {text}. 
Return only the title, nothing else. No quotes, no punctuation.
"""
        )

        return clean_title(response.text.strip(), text)

    except Exception:
        return clean_title(text, text)


def clean_title(title: str, fallback: str) -> str:
    title = " ".join((title or fallback).replace('"', "").replace("'", "").split())
    title = title.strip(".,:;!?-")
    words = title.split()
    if len(words) > 6:
        title = " ".join(words[:6])
    return title[:60] or "Real Estate Conversation"


def update_title_async(room_id: str, first_message: str) -> None:
    def worker() -> None:
        try:
            title = generate_chat_title(first_message)
            (
                get_supabase()
                .table("chat_sessions")
                .update({"title": title})
                .eq("channel_room", room_id)
                .execute()
            )
        except Exception:
            logger.exception("Could not update generated chat title")

    threading.Thread(target=worker, daemon=True).start()


def save_to_db(room_id: str, role: str, text: str) -> None:
    text = text.strip()

    if not text:
        return

    try:
        client = get_supabase()

        result = (
            client.table("chat_sessions")
            .select("transcript_log, title")
            .eq("channel_room", room_id)
            .execute()
        )

        new_line = f"{role}: {text}"

        if result.data:
            current_log = result.data[0].get("transcript_log") or ""
            current_title = result.data[0].get("title") or ""

            if (
                role.lower() == "user"
                and (
                    not current_title
                    or current_title == room_id
                    or current_title.startswith("Assalam-o-Alaikum")
                )
            ):
                update_title_async(room_id, text)

            transcript_log = (
                f"{current_log}\n{new_line}"
                if current_log
                else new_line
            )

            (
                client.table("chat_sessions")
                .update({"transcript_log": transcript_log})
                .eq("channel_room", room_id)
                .execute()
            )

        else:
            title = room_id

            if role.lower() == "user":
                title = clean_title(text, text)

            (
                client.table("chat_sessions")
                .insert(
                    {
                        "channel_room": room_id,
                        "transcript_log": new_line,
                        "title": title,
                    }
                )
                .execute()
            )

            if role.lower() == "user":
                update_title_async(room_id, text)

        logger.info(
            "Saved %s message for room %s",
            role,
            room_id,
        )

    except Exception:
        logger.exception(
            "Could not save message to Supabase"
        )
        append_file_transcript(room_id, role, text)



def load_memory(room_id: str) -> str:
    supabase_memory = ""
    try:
        result = (
            get_supabase()
            .table("chat_sessions")
            .select("transcript_log")
            .eq("channel_room", room_id)
            .execute()
        )
        if result.data:
            supabase_memory = (result.data[0].get("transcript_log") or "").strip()
    except Exception:
        logger.exception("Could not load room memory from Supabase")

    file_memory = get_file_transcript(room_id)
    if supabase_memory and file_memory and file_memory not in supabase_memory:
        return f"{supabase_memory}\n{file_memory}".strip()
    return supabase_memory or file_memory
    
def load_property_data() -> str:
    try:
        insights = (
            get_supabase()
            .table("property_insights")
            .select("*")
            .execute()
        )

        prices = (
            get_supabase()
            .table("property_prices")
            .select("*")
            .execute()
        )

        text = "\n\nPROPERTY INSIGHTS:\n"

        for row in insights.data:
            text += (
                f"Sector: {row['sector_name']}, "
                f"Category: {row['tier_category']}, "
                f"Average Price Range: {row['average_price_range']}\n"
            )

        text += "\nPROPERTY PRICES:\n"

        for row in prices.data:
            text += (
                f"Sector: {row['sector_name']}, "
                f"Type: {row['property_type']}, "
                f"Size: {row['property_size']}, "
                f"Price Range: {row['price_range']}\n"
            )

        return text

    except Exception:
        logger.exception("Could not load property data")
        return ""


def build_chat_context(room_id: str) -> ChatContext:
    chat_ctx = ChatContext.empty()

    memory = load_memory(room_id)
    property_data = load_property_data()

    if memory:
        chat_ctx.add_message(
            role="system",
            content=(
                "Previous conversation memory for this LiveKit room follows. "
                "This is an ongoing conversation, so do not greet, introduce yourself, "
                "or say welcome back. Use the memory when it is relevant, but do not "
                "mention it unless the user asks.\n\n"
                f"{memory}"
            ),
        )

    if property_data:
        chat_ctx.add_message(
            role="system",
            content=(
                "The following property database contains verified Islamabad "
                "real-estate information. Always prefer these values over your "
                "own assumptions when answering questions.\n\n"
                f"{property_data}"
            ),
        )

    return chat_ctx


class RealEstateAgent(Agent):
    def __init__(self, room_id: str) -> None:
        self.room_id = room_id
        super().__init__(
            instructions=SYSTEM_PROMPT,
            chat_ctx=build_chat_context(room_id),
        )

    async def on_user_turn_completed(
        self,
        turn_ctx: ChatContext,
        new_message: Any,
    ) -> None:
        memory = load_memory(self.room_id)
        if not memory:
            return

        turn_ctx.items = [
            item
            for item in turn_ctx.items
            if (getattr(item, "extra", None) or {}).get("kind") != "room_memory"
        ]
        turn_ctx.add_message(
            role="system",
            content=(
                "Latest saved room memory follows. Use it to answer the user's "
                "current spoken question when relevant. This is an ongoing "
                "conversation, so do not greet, introduce yourself, say welcome back, "
                "or restart the conversation. Answer the latest spoken question directly.\n\n"
                f"{memory}"
            ),
            extra={"kind": "room_memory"},
        )


def build_agent(room_id: str) -> Agent:
    return RealEstateAgent(room_id)


def get_noise_mode(value: str | None = None) -> str:
    mode = (value or os.getenv("NOISE_MODE", "off")).strip().lower()
    return mode if mode in {"off", "dtln"} else "off"


def get_noise_strength() -> float:
    try:
        return float(os.getenv("DTLN_STRENGTH", "0.5"))
    except ValueError:
        return 0.5


def build_room_input_options(noise_mode: str | None = None) -> room_io.RoomInputOptions | None:
    mode = get_noise_mode(noise_mode)

    if mode != "dtln":
        print("[NoiseCancellation] Disabled / baseline mode")
        return None

    strength = get_noise_strength()
    print(f"[NoiseCancellation] DTLN enabled with strength={strength}")

    # Apply noise suppression before STT/VAD so the downstream pipeline sees cleaner audio.
    return room_io.RoomInputOptions(
        noise_cancellation=dtln.noise_suppression(strength=strength)
    )


@server.rtc_session()
async def entrypoint(ctx: JobContext) -> None:
    validate_environment()

    room_id = ctx.room.name

    print("\n" + "=" * 50)
    print(f"ROOM ID: {room_id}")
    print("=" * 50 + "\n")

    logger.info("Starting real estate agent for room %s", room_id)

    session = AgentSession(
        vad=silero.VAD.load(),
        stt=deepgram.STT(
            model=os.getenv("DEEPGRAM_STT_MODEL", "nova-3"),
            api_key=require_env("DEEPGRAM_API_KEY"),
        ),
        llm=openai.LLM.with_deepseek(
            model=os.getenv("DEEPSEEK_MODEL", "deepseek-chat"),
            api_key=require_env("DEEPSEEK_API_KEY"),
        ),
        tts=deepgram.TTS(
            model=os.getenv("DEEPGRAM_TTS_MODEL", "aura-2-andromeda-en"),
            api_key=require_env("DEEPGRAM_API_KEY"),
        ),
    )

    room_input_options = build_room_input_options()

    @session.on("conversation_item_added")
    def on_conversation_item(event: ConversationItemAddedEvent) -> None:
        try:
            item = event.item
            role = getattr(item, "role", None)
            text = message_text(item)

            if role == "user":
                save_to_db(room_id, "User", text)

            elif role == "assistant":
                save_to_db(room_id, "Agent", text)

        except Exception:
            logger.exception("Conversation handler failed")

    @session.on("error")
    def on_session_error(event: Any) -> None:
        logger.error("Agent session error: %s", event)

    await session.start(
        agent=build_agent(room_id),
        room=ctx.room,
        record=False,
        room_input_options=room_input_options,
        room_output_options=room_io.RoomOutputOptions(
            audio_enabled=True,
            transcription_enabled=True,
        ),
    )

    # Speak immediately so the user can confirm orb audio playback works.
    await session.say(
        "Hi, I am ready. Ask me about Islamabad real estate.",
        allow_interruptions=True,
    )


if __name__ == "__main__":
    cli.run_app(server)
