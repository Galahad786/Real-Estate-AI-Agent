import { AnimatePresence, motion } from "framer-motion";

import OrbView from "./OrbView";

function MiniOrb({ audioState, onClose, onExpand }) {
  return (
    <motion.div
      className="mini-voice-orb"
      layoutId="voice-orb-shell"
      initial={{ opacity: 0, scale: 0.84 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.84 }}
      transition={{ duration: 0.25, ease: "easeOut" }}
    >
      <motion.button
        className={`voice-orb mini ${audioState}`}
        layoutId="voice-orb"
        type="button"
        onClick={onExpand}
        aria-label="Expand voice orb"
      >
        <span className="orb-ring ring-one" />
        <span className="orb-ring ring-two" />
      </motion.button>
      <button className="mini-orb-close" type="button" onClick={onClose} aria-label="End voice mode">
        x
      </button>
    </motion.div>
  );
}

export default function OrbOverlay({
  audioState,
  isMinimized,
  onClose,
  onExpand,
  onMinimize,
  onSendText,
  textIsSending,
}) {
  if (isMinimized) {
    return (
      <AnimatePresence mode="wait">
        <MiniOrb
          audioState={audioState}
          key="mini-orb"
          onClose={onClose}
          onExpand={onExpand}
        />
      </AnimatePresence>
    );
  }

  return (
    <AnimatePresence mode="wait">
      <motion.div
        className="voice-overlay"
        key="voice-overlay"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.2 }}
      >
        <OrbView
          audioState={audioState}
          onClose={onClose}
          onMinimize={onMinimize}
          onSendText={onSendText}
          textIsSending={textIsSending}
        />
      </motion.div>
    </AnimatePresence>
  );
}
