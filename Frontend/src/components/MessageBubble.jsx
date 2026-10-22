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
  const isStreaming = Boolean(message.streaming) && !text;

  return (
    <article
      className={`message-row${isUser ? " is-user" : " is-assistant"}`}
    >
      {!isUser && <div className="message-avatar">AI</div>}
      <div className="message-body">
        <div className={`message-bubble${isUser ? " user-bubble" : " assistant-bubble"}`}>
          {isUser ? (
            text
          ) : isStreaming ? (
            <div className="assistant-response">
              <p className="assistant-paragraph is-typing">Thinking…</p>
            </div>
          ) : (
            <div className="assistant-response">
              {assistantLines.map((line, index) => {
                const [label, ...rest] = line.split(":");
                const hasLabel = rest.length > 0 && label.length <= 34;

                return (
                  <p
                    className={hasLabel ? "assistant-detail" : "assistant-paragraph"}
                    key={index}
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
    </article>
  );
}
