function formatRelativeTime(value) {
  if (!value) return "Recently";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Recently";

  const diffMs = Date.now() - date.getTime();
  const minutes = Math.max(1, Math.floor(diffMs / 60000));

  if (minutes < 60) return `${minutes} min ago`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hr ago`;

  const days = Math.floor(hours / 24);
  return `${days} day${days === 1 ? "" : "s"} ago`;
}

export default function Sidebar({
  activeRoomName,
  conversations,
  isOpen,
  onClose,
  onNewChat,
  onSelectConversation,
}) {
  return (
    <>
      <button
        className={`sidebar-scrim${isOpen ? " is-visible" : ""}`}
        aria-label="Close sidebar"
        onClick={onClose}
      />

      <aside className={`sidebar${isOpen ? " is-open" : " is-closed"}`}>
        <div className="sidebar-top">
          <div className="sidebar-brand">ESTATIQ</div>
          <button className="sidebar-close" type="button" onClick={onClose}>
            x
          </button>
        </div>

        <button className="new-chat-button" type="button" onClick={onNewChat}>
          <span aria-hidden="true">+</span>
          New Chat
        </button>

        <nav className="history-list" aria-label="Conversation history">
          {conversations.length === 0 ? (
            <div className="history-empty">No saved conversations yet.</div>
          ) : (
            conversations.map((conversation) => {
              const isActive = conversation.room_name === activeRoomName;

              return (
                <button
                  className={`history-item${isActive ? " is-active" : ""}`}
                  key={conversation.room_name}
                  type="button"
                  onClick={() => onSelectConversation(conversation.room_name)}
                >
                  <span className="history-copy">
                    <span className="history-title">
                      {conversation.title || conversation.room_name}
                    </span>
                    <span className="history-time">
                      {formatRelativeTime(conversation.created_at)}
                    </span>
                  </span>
                  <span className="history-delete" aria-hidden="true">
                    x
                  </span>
                </button>
              );
            })
          )}
        </nav>

        <div className="sidebar-footer">
          <span>Powered by AI</span>
        </div>
      </aside>
    </>
  );
}
