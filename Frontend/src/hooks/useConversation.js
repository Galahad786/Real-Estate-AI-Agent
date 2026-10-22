import { useCallback, useEffect, useMemo, useRef, useState } from "react";

function normalizeMessageText(value) {
  return (value || "").trim().replace(/\s+/g, " ");
}

function polishAssistantText(value) {
  return (value || "")
    .replace(/\*\*(.*?)\*\*/g, "$1")
    .replace(/\*(.*?)\*/g, "$1")
    .replace(/^\s*-{3,}\s*$/gm, "")
    .replace(/^\s*[-*]\s+/gm, "")
    .replace(/^\s{0,3}#{1,6}\s+/gm, "")
    .replace(/[*#]/g, "")
    .replace(/\n{3,}/g, "\n\n")
    .trimStart();
}

function samePersistedMessage(first, second) {
  return (
    first.role === second.role &&
    normalizeMessageText(first.text || first.content) ===
      normalizeMessageText(second.text || second.content)
  );
}

function cleanMessageList(items) {
  const cleaned = [];

  for (const item of items) {
    const text = normalizeMessageText(item.text || item.content);
    if (!text) continue;

    const previous = cleaned.at(-1);
    if (previous) {
      const previousText = normalizeMessageText(previous.text || previous.content);
      if (previous.role === item.role && previousText === text) continue;

      if (previous.role !== item.role && previousText === text && text.length > 30) {
        if (item.role === "assistant") {
          cleaned[cleaned.length - 1] = item;
        }
        continue;
      }
    }

    cleaned.push(item);
  }

  return cleaned;
}

export function useConversation({
  apiUrl,
  roomName,
}) {
  const [messages, setMessages] = useState([]);
  const [messagesRoomName, setMessagesRoomName] = useState("");
  const [conversations, setConversations] = useState([]);
  const [draftMessages, setDraftMessages] = useState([]);
  const draftId = useRef(0);

  const loadConversations = useCallback(async () => {
    try {
      const response = await fetch(`${apiUrl}/api/conversations`);
      if (!response.ok) return;

      const data = await response.json();
      setConversations(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error(err);
    }
  }, [apiUrl]);

  const loadHistory = useCallback(async () => {
    if (!roomName) return [];

    try {
      const response = await fetch(`${apiUrl}/api/history/${roomName}`);
      if (!response.ok) return [];

      const data = await response.json();
      const nextMessages = cleanMessageList(
        Array.isArray(data)
          ? data.map((message, index) => ({
              id: `${roomName}-${index}`,
              ...message,
              text:
                message.role === "assistant"
                  ? polishAssistantText(message.text || message.content || "")
                  : message.text,
            }))
          : [],
      );

      setMessages(nextMessages);
      setMessagesRoomName(roomName);
      return nextMessages;
    } catch (err) {
      console.error(err);
      return [];
    }
  }, [apiUrl, roomName]);

  const addDraftMessage = useCallback((message) => {
    draftId.current += 1;
    setDraftMessages((current) => [
      ...current,
      {
        id: `draft-${draftId.current}`,
        room_name: roomName,
        ...message,
      },
    ]);
    return `draft-${draftId.current}`;
  }, [roomName]);

  const updateDraftMessage = useCallback((id, text) => {
    const polishedText = polishAssistantText(text);

    setDraftMessages((current) =>
      current.map((message) =>
        message.id === id
          ? {
              ...message,
              text: message.role === "assistant" ? polishedText : text,
            }
          : message,
      ),
    );
  }, []);

  const currentMessages = useMemo(
    () => (messagesRoomName === roomName ? messages : []),
    [messages, messagesRoomName, roomName],
  );

  const visibleDraftMessages = useMemo(
    () =>
      draftMessages.filter((message) => {
        if (message.room_name !== roomName) return false;
        if (!normalizeMessageText(message.text || message.content)) return true;
        return !currentMessages.some((savedMessage) =>
          samePersistedMessage(savedMessage, message),
        );
      }),
    [currentMessages, draftMessages, roomName],
  );

  const sendTextMessage = useCallback(async (text) => {
    if (!roomName) return;

    const userId = addDraftMessage({
      role: "user",
      text,
      source: "text",
    });

    const assistantId = addDraftMessage({
      role: "assistant",
      text: "",
      source: "text",
    });
    let assistantText = "";

    const history = [...currentMessages, ...visibleDraftMessages]
      .filter((message) => message.id !== userId && message.id !== assistantId)
      .slice(-10)
      .map((message) => ({
        role: message.role,
        text: message.text || message.content || "",
      }));

    try {
      const response = await fetch(`${apiUrl}/api/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          room_name: roomName,
          message: text,
          history,
        }),
      });

      if (!response.ok) {
        throw new Error(`Text chat failed with status ${response.status}`);
      }

      const contentType = response.headers.get("content-type") || "";

      if (!response.body || contentType.includes("application/json")) {
        const data = await response.json();
        assistantText = polishAssistantText(
          data.text || data.message || data.response || data.content || "",
        );
        updateDraftMessage(assistantId, assistantText);
      } else {
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let flushTimer = null;
        let rawAssistantText = "";

        const flushAssistantText = () => {
          flushTimer = null;
          assistantText = polishAssistantText(rawAssistantText);
          updateDraftMessage(assistantId, assistantText);
        };

        while (true) {
          const { value, done } = await reader.read();
          if (done) break;

          rawAssistantText += decoder.decode(value, { stream: true });
          if (flushTimer === null) {
            flushTimer = window.setTimeout(flushAssistantText, 80);
          }
        }

        rawAssistantText += decoder.decode();
        if (flushTimer !== null) {
          window.clearTimeout(flushTimer);
        }
        assistantText = polishAssistantText(rawAssistantText);
        updateDraftMessage(assistantId, assistantText);
      }

      const savedMessages = await loadHistory();
      const hasSavedUserMessage = savedMessages.some((message) =>
        samePersistedMessage(message, { role: "user", text }),
      );
      const hasSavedAssistantMessage = savedMessages.some((message) =>
        samePersistedMessage(message, { role: "assistant", text: assistantText }),
      );

      if (hasSavedUserMessage && hasSavedAssistantMessage) {
        setDraftMessages((current) =>
          current.filter(
            (message) => message.id !== userId && message.id !== assistantId,
          ),
        );
      }
      void loadConversations();
      return assistantText;
    } catch (err) {
      console.error(err);
      const errorText =
        "Text chat endpoint is unavailable. Voice mode is still connected.";
      updateDraftMessage(
        assistantId,
        errorText,
      );
      return "";
    }
  }, [
    addDraftMessage,
    apiUrl,
    loadConversations,
    loadHistory,
    currentMessages,
    roomName,
    updateDraftMessage,
    visibleDraftMessages,
  ]);

  useEffect(() => {
    const timeout = window.setTimeout(loadConversations, 0);
    return () => window.clearTimeout(timeout);
  }, [loadConversations]);

  useEffect(() => {
    if (!roomName) return undefined;

    const timeout = window.setTimeout(loadHistory, 0);
    return () => window.clearTimeout(timeout);
  }, [loadHistory, roomName]);

  const activeConversation = useMemo(
    () => conversations.find((conversation) => conversation.room_name === roomName),
    [conversations, roomName],
  );

  return {
    messages: currentMessages,
    conversations,
    activeConversation,
    draftMessages: visibleDraftMessages,
    loadConversations,
    loadHistory,
    addDraftMessage,
    sendTextMessage,
  };
}
