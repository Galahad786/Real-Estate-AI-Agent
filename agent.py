import logging
import os
from typing import Any

from dotenv import load_dotenv
from livekit.agents import (
    Agent,
    AgentServer,
    AgentSession,
    ChatContext,
    ConversationItemAddedEvent,
    JobContext,
    cli,
)
from livekit.plugins import deepgram, openai, silero
from supabase import Client, create_client


load_dotenv()

logging.basicConfig(level=logging.INFO)

# Hide noisy HTTP logs
logging.getLogger("httpx").setLevel(logging.WARNING)
logging.getLogger("httpcore").setLevel(logging.WARNING)
logging.getLogger("hpack").setLevel(logging.WARNING)

logger = logging.getLogger("real-estate-ai-agent")


SYSTEM_PROMPT = """
You are a helpful real estate AI assistant for buyers, renters, sellers, and agents.

Your style:
- Be conversational, concise, and practical.
- Ask one or two focused follow-up questions when the user has not provided enough detail.
- Remember facts from the current room history, such as budget, city, preferred areas,
  bedrooms, property type, financing needs, timeline, and previous recommendations.
- Never invent live listings, prices, legal advice, mortgage approvals, or guarantees.
- If the user asks for market, legal, tax, or financing decisions, explain that they
  should verify with a licensed local professional before acting.
- For real estate searches, collect location, budget, buy/rent, bedrooms, property type,
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
    value = os.getenv(name)
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


def save_to_db(room_id: str, role: str, text: str) -> None:
    text = text.strip()

    if not text:
        return

    try:
        client = get_supabase()
        result = (
            client.table("chat_sessions")
            .select("transcript_log")
            .eq("channel_room", room_id)
            .execute()
        )

        new_line = f"{role}: {text}"
        if result.data:
            current_log = result.data[0].get("transcript_log") or ""
            transcript_log = f"{current_log}\n{new_line}" if current_log else new_line
            (
                client.table("chat_sessions")
                .update({"transcript_log": transcript_log})
                .eq("channel_room", room_id)
                .execute()
            )
        else:
            (
                client.table("chat_sessions")
                .insert({"channel_room": room_id, "transcript_log": new_line})
                .execute()
            )

        logger.info("Saved %s message for room %s", role, room_id)
    except Exception:
        logger.exception("Could not save message to Supabase")


def load_memory(room_id: str) -> str:
    try:
        result = (
            get_supabase()
            .table("chat_sessions")
            .select("transcript_log")
            .eq("channel_room", room_id)
            .execute()
        )
        if not result.data:
            return ""
        return (result.data[0].get("transcript_log") or "").strip()
    except Exception:
        logger.exception("Could not load room memory from Supabase")
        return ""
    
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
                "Use it when it is relevant, but do not mention it unless the user asks.\n\n"
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


def build_agent(room_id: str) -> Agent:
    return Agent(
        instructions=SYSTEM_PROMPT,
        chat_ctx=build_chat_context(room_id),
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
        stt=deepgram.STT(model=os.getenv("DEEPGRAM_STT_MODEL", "nova-3")),
        llm=openai.LLM.with_deepseek(
            model=os.getenv("DEEPSEEK_MODEL", "deepseek-chat"),
        ),
        tts=deepgram.TTS(model=os.getenv("DEEPGRAM_TTS_MODEL", "aura-2-andromeda-en")),
    )

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

    await session.start(
        agent=build_agent(room_id),
        room=ctx.room,
        record=False,
    )

    session.say(
        "Assalam-o-Alaikum! I am your real estate AI assistant. "
        "Tell me what kind of property you are looking for.",
        allow_interruptions=True,
    )


if __name__ == "__main__":
    cli.run_app(server)
