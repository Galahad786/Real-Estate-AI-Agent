import { useEffect, useMemo } from "react";
import { useRoomContext, useTranscriptions } from "@livekit/components-react";

function polishAssistantText(value) {
  return (value || "")
    .replace(/\*\*(.*?)\*\*/g, "$1")
    .replace(/\*(.*?)\*/g, "$1")
    .replace(/^\s*-{3,}\s*$/gm, "")
    .replace(/^\s*[-*]\s+/gm, "")
    .replace(/^\s{0,3}#{1,6}\s+/gm, "")
    .replace(/[*#]/g, "")
    .replace(/\n{3,}/g, "\n\n")
    .trimStart();
}

export default function LiveTranscriptionBridge({ enabled, onMessages }) {
  const room = useRoomContext();
  const transcriptions = useTranscriptions({ room });

  const messages = useMemo(() => {
    if (!enabled) return [];

    return transcriptions
      .map((transcription) => {
        const isUser =
          transcription.participantInfo.identity === room.localParticipant.identity;
        const rawText = transcription.text?.trim();
        const text = isUser ? rawText : polishAssistantText(rawText);
        if (!text?.trim()) return null;

        return {
          id: `voice-${transcription.streamInfo.id}`,
          role: isUser ? "user" : "assistant",
          text,
          source: "voice-live",
        };
      })
      .filter(Boolean);
  }, [enabled, room.localParticipant.identity, transcriptions]);

  useEffect(() => {
    onMessages(messages);
  }, [messages, onMessages]);

  useEffect(() => () => onMessages([]), [onMessages]);

  return null;
}
