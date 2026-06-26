export function useLiveKit({ voiceOpen, messages }) {
  let audioState = "idle";

  if (voiceOpen) {
    const lastMessage = messages[messages.length - 1];
    audioState = lastMessage?.role === "assistant" ? "speaking" : "listening";
  }

  return { audioState };
}
