import { useEffect, useRef, useState } from "react";

export default function InputBar({
  isRecording,
  isSending,
  onMicClick,
  onSend,
  onStop,
}) {
  const [value, setValue] = useState("");
  const textareaRef = useRef(null);

  useEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;

    textarea.style.height = "24px";
    textarea.style.height = `${Math.min(Math.max(textarea.scrollHeight, 24), 120)}px`;
  }, [value]);

  function submit() {
    const text = value.trim();
    if (!text || isSending) return;

    onSend(text);
    setValue("");
  }

  return (
    <footer className="input-footer">
      <div className="composer">
        <button
          className={`circle-button mic-button${isRecording ? " is-recording" : ""}`}
          type="button"
          aria-label="Start voice mode"
          onClick={onMicClick}
        >
          <svg
            className="mic-icon"
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
        </button>
        <textarea
          ref={textareaRef}
          className="chat-input"
          value={value}
          rows={1}
          placeholder="Ask about Islamabad properties..."
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
      <p className="disclaimer">AI responses are for informational purposes only.</p>
    </footer>
  );
}
