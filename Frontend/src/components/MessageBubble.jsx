import { motion } from "framer-motion";

function formatAssistantText(text) {
  return text
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean);
}

export default function MessageBubble({ message }) {
  const isUser = message.role === "user";
  const text = message.text || message.content || "";
  const assistantLines = isUser ? [] : formatAssistantText(text);

  return (
    <motion.article
      className={`message-row${isUser ? " is-user" : " is-assistant"}`}
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.18, ease: "easeOut" }}
      layout={false}
    >
      {!isUser && <div className="message-avatar">AI</div>}
      <div className="message-body">
        <div className={`message-bubble${isUser ? " user-bubble" : " assistant-bubble"}`}>
          {isUser ? (
            text
          ) : (
            <div className="assistant-response">
              {assistantLines.map((line, index) => {
                const [label, ...rest] = line.split(":");
                const hasLabel = rest.length > 0 && label.length <= 34;

                return (
                  <p
                    className={hasLabel ? "assistant-detail" : "assistant-paragraph"}
                    key={`${line}-${index}`}
                  >
                    {hasLabel ? (
                      <>
                        <span>{label.trim()}:</span>
                        {" "}
                        {rest.join(":").trim()}
                      </>
                    ) : (
                      line
                    )}
                  </p>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </motion.article>
  );
}
