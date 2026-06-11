import asyncio
import logging
import json
import os
from dotenv import load_dotenv
from supabase import create_client, Client
from livekit.agents import JobContext, llm, VoicePipelineAgent
from livekit.plugins import openai, silero, deepgram

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("Real-Estate-AI-Agent")
load_dotenv()

# Instantiate secure connection to Supabase DB Cloud
SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY")
supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)

async def entrypoint(ctx: JobContext):
    logger.info(f"Connecting Agent Backend to Audio Stream Room: {ctx.room.name}")
    
    # 🧠 Initialize modern Chat Context
    chat_memory = llm.ChatContext()
    session_transcript_accumulator = []

    # CHATGPT HISTORY LAYER: Fetch past conversation from Supabase if it exists
    room_id = ctx.room.name
    try:
        past_session = supabase.table("chat_sessions").select("transcript_log").eq("channel_room", room_id).execute()
        if past_session.data:
            logger.info(f"Found existing history for room {room_id}. Loading into memory...")
            raw_log = past_session.data[0]["transcript_log"]
            
            # Parse the text transcript back into individual memory messages for the AI
            for line in raw_log.split("\n"):
                if line.startswith("User: ") or line.startswith("User (Typed): "):
                    text = line.replace("User: ", "").replace("User (Typed): ", "")
                    chat_memory.messages.append(llm.ChatMessage(role="user", content=text))
                elif line.startswith("Agent: "):
                    text = line.replace("Agent: ", "")
                    chat_memory.messages.append(llm.ChatMessage(role="assistant", content=text))
    except Exception as history_err:
        logger.error(f"Error restoring past conversation history: {history_err}")

    # Set up the system prompt inside the chat memory context array
    chat_memory.messages.insert(0, llm.ChatMessage(
        role="system",
        content=(
            "You are an expert real estate AI assistant named 'Real Estate A.I Agent', specializing in Islamabad, Pakistan. "
            "Be professional, polite, and helpful. Guide users about sectors like D-12, E-7, G-11, and I-8. "
            "You have access to the conversation history. If the user asks about something discussed previously, refer back to it naturally."
        )
    ))

    # Build the Voice Agent with pre-loaded memory context
    real_estate_agent = VoicePipelineAgent(
        vad=silero.VAD.load(),
        stt=deepgram.STT(),  
        llm=openai.LLM.with_deepseek(model="deepseek-chat", temperature=0.7),
        tts=deepgram.TTS(),
        chat_ctx=chat_memory
    )

    await ctx.connect()
    real_estate_agent.start(ctx.room)

    # Accumulate live transcripts as the call progresses
    @real_estate_agent.on("user_speech_transcribed")
    def on_user_speech(agent, text: str):
        if text.strip():
            session_transcript_accumulator.append(f"User: {text}")

    @real_estate_agent.on("agent_speech_committed")
    def on_agent_speech(agent, msg: llm.ChatMessage):
        if msg.content and msg.content.strip():
            session_transcript_accumulator.append(f"Agent: {msg.content}")

    @ctx.room.on("data_received")
    def on_data_received(data: bytes, participant, kind):
        try:
            payload = json.loads(data.decode('utf-8'))
            if "message" in payload:
                user_text = payload["message"]
                session_transcript_accumulator.append(f"User (Typed): {user_text}")
                asyncio.create_task(real_estate_agent.say(user_text, allow_interruptions=True))
        except Exception as e:
            logger.error(f"Error handling text data packet: {e}")

    # Only say the warm greeting if it's a completely brand new chat
    if len(chat_memory.messages) <= 1:  # Only system prompt is inside
        await real_estate_agent.say(
            "Assalam-o-Alaikum! Welcome, I am your Real Estate A.I Agent. How can I help you navigate properties in Islamabad today?",
            allow_interruptions=True
        )

    # Keep working loop active until user session severs
    while ctx.room.connection_state == "connected" or ctx.room.connection_state == "connecting":
        await asyncio.sleep(1)

    # User disconnected -> Upsert the final combined transcript text back to Supabase
    try:
        existing_record = supabase.table("chat_sessions").select("transcript_log").eq("channel_room", room_id).execute()
        
        new_log = "\n".join(session_transcript_accumulator)
        if existing_record.data and new_log:
            full_transcript = existing_record.data[0]["transcript_log"] + "\n" + new_log
            supabase.table("chat_sessions").update({"transcript_log": full_transcript}).eq("channel_room", room_id).execute()
        elif new_log:
            supabase.table("chat_sessions").insert({
                "user_identity": "WebUser",
                "channel_room": room_id,
                "transcript_log": new_log
            }).execute()
        logger.info("Successfully synced conversation updates to Supabase.")
    except Exception as db_err:
        logger.error(f"Failed writing execution tracking frames to database stack: {db_err}")

if __name__ == "__main__":
    from livekit.agents import cli
    cli.run_app(entrypoint)