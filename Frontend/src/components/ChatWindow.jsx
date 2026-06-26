import { useEffect, useRef } from "react";
import { AnimatePresence, motion } from "framer-motion";

import MessageBubble from "./MessageBubble";
import SuggestionChips from "./SuggestionChips";

function messageKey(message, index) {
  if (message.id) return message.id;
  return `${message.role}-${index}`;
}

export default function ChatWindow({
  messages,
  onSuggestionClick,
  compact = false,
  isStreaming = false,
}) {
  const endRef = useRef(null);
  const windowRef = useRef(null);
  const shouldFollowRef = useRef(true);

  function handleScroll() {
    const element = windowRef.current;
    if (!element) return;

    const distanceFromBottom =
      element.scrollHeight - element.scrollTop - element.clientHeight;
    shouldFollowRef.current = distanceFromBottom < 120;
  }

  useEffect(() => {
    const element = windowRef.current;
    if (!element || !shouldFollowRef.current) return undefined;

    const frame = window.requestAnimationFrame(() => {
      if (isStreaming) {
        element.scrollTop = element.scrollHeight;
        return;
      }

      endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
    });

    return () => window.cancelAnimationFrame(frame);
  }, [isStreaming, messages]);

  return (
    <section
      className={`chat-window${compact ? " is-compact" : ""}`}
      onScroll={handleScroll}
      ref={windowRef}
    >
      {messages.length === 0 ? (
        <div className="empty-state">
          <h1>How can I help with Islamabad real estate?</h1>
          <p>Ask about sectors, pricing, availability, or investment context.</p>
          <SuggestionChips onSuggestionClick={onSuggestionClick} />
        </div>
      ) : (
        <motion.div className="message-list">
          <AnimatePresence initial={false}>
            {messages.map((message, index) => (
              <MessageBubble
                key={messageKey(message, index)}
                message={message}
              />
            ))}
          </AnimatePresence>
          <div ref={endRef} />
        </motion.div>
      )}
    </section>
  );
}
