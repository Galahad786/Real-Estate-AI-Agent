import { useEffect, useRef } from "react";

import MessageBubble from "./MessageBubble";
import SuggestionChips from "./SuggestionChips";

function messageKey(message, index) {
  if (message.id) return message.id;
  return `${message.role}-${index}`;
}

function isNearBottom(element, threshold = 120) {
  return (
    element.scrollHeight - element.scrollTop - element.clientHeight < threshold
  );
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
  const wasStreamingRef = useRef(false);

  function handleScroll() {
    const element = windowRef.current;
    if (!element || isStreaming) return;

    shouldFollowRef.current = isNearBottom(element);
  }

  useEffect(() => {
    const startedStreaming = isStreaming && !wasStreamingRef.current;
    wasStreamingRef.current = isStreaming;

    // Sending always scrolls to the latest exchange, even if scrolled up.
    if (startedStreaming) {
      shouldFollowRef.current = true;
    }

    if (!windowRef.current) return undefined;
    if (!isStreaming && !shouldFollowRef.current) return undefined;

    const frame = window.requestAnimationFrame(() => {
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
        <div className="message-list">
          {messages.map((message, index) => (
            <MessageBubble
              key={messageKey(message, index)}
              message={message}
            />
          ))}
          <div ref={endRef} />
        </div>
      )}
    </section>
  );
}
