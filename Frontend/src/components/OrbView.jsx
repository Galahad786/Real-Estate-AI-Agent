import { motion } from "framer-motion";
import { useState } from "react";

const STATUS_TEXT = {
  idle: "Ready",
  listening: "Listening...",
  processing: "Processing...",
  speaking: "Speaking...",
};

export default function OrbView({
  audioState,
  onClose,
  onMinimize,
  onSendText,
  textIsSending,
}) {
  const [value, setValue] = useState("");

  function submitText() {
    const text = value.trim();
    if (!text || textIsSending) return;

    onSendText(text);
    setValue("");
  }

  return (
    <section className="orb-view" aria-label="Voice mode">
      <motion.div className="voice-orb-shell" layoutId="voice-orb-shell">
        <motion.button
          className={`voice-orb ${audioState}`}
          layoutId="voice-orb"
          type="button"
          onClick={onMinimize}
          aria-label="Show chat and minimize voice orb"
        >
          <span className="orb-ring ring-one" />
          <span className="orb-ring ring-two" />
        </motion.button>
      </motion.div>

      <p className="voice-status">{STATUS_TEXT[audioState] || STATUS_TEXT.idle}</p>

      <div className="voice-text-composer">
        <input
          className="voice-text-input"
          type="text"
          value={value}
          placeholder="Type while voice mode is active..."
          onChange={(event) => setValue(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              submitText();
            }
          }}
        />
        <button
          className="voice-text-send"
          type="button"
          disabled={!value.trim() || textIsSending}
          onClick={submitText}
          aria-label="Send typed voice message"
        >
          ↑
        </button>
      </div>

      <div className="voice-controls">
        <button className="end-call-button" type="button" onClick={onClose}>
          x
        </button>
      </div>
    </section>
  );
}
