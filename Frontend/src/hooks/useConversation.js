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
    if (!text && item.role !== "assistant") continue;
    // Keep in-progress assistant placeholders (empty text while streaming).
    if (!text && item.role === "assistant" && !item.streaming) continue;

    const previous = cleaned.at(-1);
    if (previous && text) {
      const previousText = normalizeMessageText(previous.text || previous.content);
      if (previous.role === item.role && previousText === text) continue;

      if (
        previous.role !== item.role &&
        previousText === text &&
        text.length > 30
      ) {
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

/** Keep existing React keys when server history matches on-screen messages. */
function reconcileMessages(previous, next, roomName) {
  const used = new Set();

  return next.map((message, index) => {
    const matchIndex = previous.findIndex(
      (candidate, candidateIndex) =>
        !used.has(candidateIndex) && samePersistedMessage(candidate, message),
    );

    if (matchIndex >= 0) {
      used.add(matchIndex);
      return {
        ...message,
        id: previous[matchIndex].id,
      };
    }

    return {
      ...message,
      id: message.id || `${roomName}-${index}`,
    };
  });
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
  const messagesRoomRef = useRef("");
  const sendingRef = useRef(false);
  const abortControllerRef = useRef(null);

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
    if (!roomName || sendingRef.current) return [];

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

      setMessages((previous) => {
        // Never replace newer local messages with a stale/shorter server snapshot.
        if (
          messagesRoomRef.current === roomName &&
          previous.length > nextMessages.length
        ) {
          return previous;
        }

        const baseline =
          messagesRoomRef.current === roomName ? previous : [];
        messagesRoomRef.current = roomName;
        return reconcileMessages(baseline, nextMessages, roomName);
      });
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

  const currentMessages = useMemo(
    () => (messagesRoomName === roomName ? messages : []),
    [messages, messagesRoomName, roomName],
  );

  const visibleDraftMessages = useMemo(
    () =>
      draftMessages.filter((message) => {
        if (message.room_name !== roomName) return false;
        if (!normalizeMessageText(message.text || message.content)) {
          return Boolean(message.streaming);
        }
        return !currentMessages.some((savedMessage) =>
          samePersistedMessage(savedMessage, message),
        );
      }),
    [currentMessages, draftMessages, roomName],
  );

  const stopTextMessage = useCallback(() => {
    abortControllerRef.current?.abort();
  }, []);

  const sendTextMessage = useCallback(async (text) => {
    if (!roomName) return;

    abortControllerRef.current?.abort();
    const controller = new AbortController();
    abortControllerRef.current = controller;

    sendingRef.current = true;
    draftId.current += 1;
    const userId = `local-${draftId.current}`;
    draftId.current += 1;
    const assistantId = `local-${draftId.current}`;

    // One list only — user + streaming assistant — so keys never swap.
    setMessages((previous) =>
      cleanMessageList([
        ...previous,
        { id: userId, role: "user", text, source: "text" },
        {
          id: assistantId,
          role: "assistant",
          text: "",
          source: "text",
          streaming: true,
        },
      ]),
    );
    messagesRoomRef.current = roomName;
    setMessagesRoomName(roomName);

    let assistantText = "";

    const history = currentMessages.slice(-10).map((message) => ({
      role: message.role,
      text: message.text || message.content || "",
    }));
    history.push({ role: "user", text });

    const patchAssistant = (nextText, streaming = true) => {
      assistantText = nextText;
      setMessages((previous) =>
        previous.map((message) =>
          message.id === assistantId
            ? {
                ...message,
                text: nextText,
                streaming,
              }
            : message,
        ),
      );
    };

    try {
      const response = await fetch(`${apiUrl}/api/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          room_name: roomName,
          message: text,
          history,
        }),
        signal: controller.signal,
      });

      if (!response.ok) {
        throw new Error(`Text chat failed with status ${response.status}`);
      }

      const contentType = response.headers.get("content-type") || "";

      if (!response.body || contentType.includes("application/json")) {
        const data = await response.json();
        patchAssistant(
          polishAssistantText(
            data.text || data.message || data.response || data.content || "",
          ),
          false,
        );
      } else {
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let flushFrame = null;
        let rawAssistantText = "";

        const flushAssistantText = (streaming = true) => {
          flushFrame = null;
          patchAssistant(polishAssistantText(rawAssistantText), streaming);
        };

        try {
          while (true) {
            const { value, done } = await reader.read();
            if (done) break;

            rawAssistantText += decoder.decode(value, { stream: true });
            if (flushFrame === null) {
              flushFrame = window.requestAnimationFrame(() =>
                flushAssistantText(true),
              );
            }
          }
        } catch (streamError) {
          if (streamError?.name !== "AbortError") {
            throw streamError;
          }
        }

        rawAssistantText += decoder.decode();
        if (flushFrame !== null) {
          window.cancelAnimationFrame(flushFrame);
        }
        flushAssistantText(false);

        if (controller.signal.aborted && !rawAssistantText.trim()) {
          patchAssistant("Response stopped.", false);
        }
      }

      void loadConversations();
      return assistantText;
    } catch (err) {
      if (err?.name === "AbortError") {
        patchAssistant(
          assistantText.trim() ? assistantText : "Response stopped.",
          false,
        );
        return assistantText;
      }

      console.error(err);
      patchAssistant(
        "Text chat endpoint is unavailable. Voice mode is still connected.",
        false,
      );
      return "";
    } finally {
      if (abortControllerRef.current === controller) {
        abortControllerRef.current = null;
      }
      sendingRef.current = false;
    }
  }, [
    apiUrl,
    loadConversations,
    currentMessages,
    roomName,
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
    stopTextMessage,
  };
}
