import { useEffect, useRef, useState } from "react";

export default function InputBar({ isRecording, isSending, onMicClick, onSend }) {
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
              submit();
            }
          }}
        />
        <div className="composer-actions">
          <button
            className={`circle-button mic-button${isRecording ? " is-recording" : ""}`}
            type="button"
            aria-label="Start voice mode"
            onClick={onMicClick}
          >
            🎙
          </button>
          <button
            className="circle-button send-button"
            type="button"
            aria-label="Send message"
            disabled={!value.trim() || isSending}
            onClick={submit}
          >
            ↑
          </button>
        </div>
      </div>
      <p className="disclaimer">AI responses are for informational purposes only.</p>
    </footer>
  );
}
