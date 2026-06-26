import { motion } from "framer-motion";

const STATUS_TEXT = {
  idle: "Ready",
  listening: "Listening...",
  processing: "Processing...",
  speaking: "Speaking...",
};

export default function OrbView({ audioState, onClose, onMinimize }) {
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

      <div className="voice-controls">
        <button className="end-call-button" type="button" onClick={onClose}>
          x
        </button>
      </div>
    </section>
  );
}
