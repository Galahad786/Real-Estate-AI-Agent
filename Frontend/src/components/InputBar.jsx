import { useEffect, useRef, useState } from "react";

import { useSpeechDictation } from "../hooks/useSpeechDictation";

function MicIcon() {
  return (
    <svg
      className="composer-icon"
      viewBox="0 0 24 24"
      width="18"
      height="18"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M12 15a3.5 3.5 0 0 0 3.5-3.5v-5a3.5 3.5 0 1 0-7 0v5A3.5 3.5 0 0 0 12 15Z" />
      <path d="M18 11.5v.5a6 6 0 0 1-12 0v-.5" />
      <path d="M12 18.5v2" />
    </svg>
  );
}

function VoiceModeIcon() {
  return (
    <svg
      className="composer-icon"
      viewBox="0 0 24 24"
      width="18"
      height="18"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M4 10v4" />
      <path d="M8 7v10" />
      <path d="M12 4v16" />
      <path d="M16 7v10" />
      <path d="M20 10v4" />
    </svg>
  );
}

export default function InputBar({
  isVoiceOpen,
  isSending,
  onVoiceClick,
  onSend,
  onStop,
}) {
  const [value, setValue] = useState("");
  const textareaRef = useRef(null);
  const { isListening, toggle, stop } = useSpeechDictation({
    enabled: !isVoiceOpen && !isSending,
    onTranscript: (transcript) => setValue(transcript),
  });

  useEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;

    textarea.style.height = "24px";
    textarea.style.height = `${Math.min(Math.max(textarea.scrollHeight, 24), 120)}px`;
  }, [value]);

  useEffect(() => {
    if (isVoiceOpen || isSending) {
      stop();
    }
  }, [isSending, isVoiceOpen, stop]);

  function submit() {
    const text = value.trim();
    if (!text || isSending) return;

    stop();
    onSend(text);
    setValue("");
  }

  function handleMicClick() {
    if (isSending || isVoiceOpen) return;
    toggle(value);
  }

  function handleVoiceClick() {
    stop();
    onVoiceClick();
  }

  return (
    <footer className="input-footer">
      <div className="composer">
        <button
          className={`circle-button mic-button${isListening ? " is-listening" : ""}`}
          type="button"
          aria-label={isListening ? "Stop dictation" : "Dictate message"}
          aria-pressed={isListening}
          disabled={isSending || isVoiceOpen}
          onClick={handleMicClick}
          title={isListening ? "Stop dictation" : "Dictate"}
        >
          <MicIcon />
        </button>
        <textarea
          ref={textareaRef}
          className="chat-input"
          value={value}
          rows={1}
          placeholder={
            isListening
              ? "Listening… speak now"
              : "Ask about Islamabad properties..."
          }
          onChange={(event) => setValue(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault();
              if (isSending) return;
              submit();
            }
          }}
        />
        <div className="composer-actions">
          <button
            className={`circle-button voice-mode-button${isVoiceOpen ? " is-active" : ""}`}
            type="button"
            aria-label="Start voice conversation"
            disabled={isSending}
            onClick={handleVoiceClick}
            title="Talk with the AI"
          >
            <VoiceModeIcon />
          </button>
          {isSending ? (
            <button
              className="circle-button stop-button"
              type="button"
              aria-label="Stop response"
              onClick={onStop}
            >
              <span className="stop-icon" aria-hidden="true" />
            </button>
          ) : (
            <button
              className="circle-button send-button"
              type="button"
              aria-label="Send message"
              disabled={!value.trim()}
              onClick={submit}
            >
              ↑
            </button>
          )}
        </div>
      </div>
      <p className="disclaimer">
        {isListening
          ? "Dictating into the text box. Click the mic again when you are done."
          : "AI responses are for informational purposes only."}
      </p>
    </footer>
  );
}
