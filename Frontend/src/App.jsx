import { useMemo, useState } from "react";
import { LiveKitRoom, RoomAudioRenderer } from "@livekit/components-react";

import "@livekit/components-styles";

import ChatWindow from "./components/ChatWindow";
import InputBar from "./components/InputBar";
import LiveTranscriptionBridge from "./components/LiveTranscriptionBridge";
import OrbOverlay from "./components/OrbOverlay";
import Sidebar from "./components/Sidebar";
import TopBar from "./components/TopBar";
import { useConversation } from "./hooks/useConversation";
import { useLiveKit } from "./hooks/useLiveKit";
import "./App.css";

function normalizeMessageText(value) {
  return (value || "").trim().replace(/\s+/g, " ");
}

function cleanVisibleMessages(items) {
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

function sameVisibleMessage(first, second) {
  return (
    first.role === second.role &&
    normalizeMessageText(first.text || first.content) ===
      normalizeMessageText(second.text || second.content)
  );
}

function mergeVisibleMessages(baseMessages, liveMessages) {
  const liveKeys = new Set(
    liveMessages.map(
      (message) =>
        `${message.role}:${normalizeMessageText(message.text || message.content)}`,
    ),
  );
  const baseWithoutLiveMatches = baseMessages.filter((message) => {
    const key = `${message.role}:${normalizeMessageText(
      message.text || message.content,
    )}`;
    return !liveKeys.has(key);
  });

  return cleanVisibleMessages([...baseWithoutLiveMatches, ...liveMessages]).filter(
    (message, index, items) =>
      items.findIndex((item) => sameVisibleMessage(item, message)) === index,
  );
}

const DEPLOYED_API_URL = "https://athletic-learning-production.up.railway.app";
const configuredApiUrl = import.meta.env.VITE_API_URL || "";
const API_URL =
  configuredApiUrl.includes("your-backend-domain.com")
    ? DEPLOYED_API_URL
    : configuredApiUrl || (import.meta.env.DEV ? "" : DEPLOYED_API_URL);
const LIVEKIT_URL = "wss://test-1-euow2v8o.livekit.cloud";

async function readErrorMessage(response) {
  const fallback = `Unable to create LiveKit token (${response.status})`;

  try {
    const contentType = response.headers.get("content-type") || "";
    if (contentType.includes("application/json")) {
      const data = await response.json();
      return data.detail || data.message || fallback;
    }

    const text = await response.text();
    return text ? `${fallback}: ${text.slice(0, 160)}` : fallback;
  } catch {
    return fallback;
  }
}

export default function App() {
  const [token, setToken] = useState(null);
  const [roomName, setRoomName] = useState("");
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [voiceOpen, setVoiceOpen] = useState(false);
  const [voiceMinimized, setVoiceMinimized] = useState(false);
  const [tokenRoomName, setTokenRoomName] = useState("");
  const [isSendingText, setIsSendingText] = useState(false);
  const [liveVoiceMessages, setLiveVoiceMessages] = useState([]);

  const {
    messages,
    conversations,
    activeConversation,
    draftMessages,
    loadConversations,
    loadHistory,
    sendTextMessage,
  } = useConversation({
    apiUrl: API_URL,
    roomName,
  });

  async function connectToRoom(nextRoomName) {
    const room = nextRoomName || `room-${Date.now()}`;
    setRoomName(room);

    const response = await fetch(`${API_URL}/api/livekit-token`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        room_name: room,
        identity: `user-${Date.now()}`,
      }),
    });

    if (!response.ok) {
      throw new Error(await readErrorMessage(response));
    }

    const data = await response.json();
    setToken(data.token);
    setTokenRoomName(room);
    setVoiceOpen(false);
    setVoiceMinimized(false);
    await loadConversations();
  }

  async function startConversation() {
    try {
      await connectToRoom();
    } catch (err) {
      console.error(err);
      alert(err?.message || "Failed to connect");
    }
  }

  async function selectConversation(nextRoomName) {
    setRoomName(nextRoomName);
    setSidebarOpen(false);

    if (!token) {
      try {
        await connectToRoom(nextRoomName);
      } catch (err) {
        console.error(err);
        alert(err?.message || "Failed to load conversation");
      }
    }
  }

  async function handleSendText(text) {
    if (isSendingText) return;

    try {
      setIsSendingText(true);
      await sendTextMessage(text);
    } finally {
      setIsSendingText(false);
    }
  }

  const visibleMessages = useMemo(
    () =>
      voiceOpen
        ? mergeVisibleMessages([...messages, ...draftMessages], liveVoiceMessages)
        : cleanVisibleMessages([...messages, ...draftMessages]),
    [draftMessages, liveVoiceMessages, messages, voiceOpen],
  );
  const { audioState } = useLiveKit({ voiceOpen, messages: visibleMessages });
  const title = activeConversation?.title || "New Islamabad property conversation";

  async function openVoiceMode() {
    if (!token || tokenRoomName !== roomName) {
      await connectToRoom(roomName);
    }

    setVoiceOpen(true);
    setVoiceMinimized(false);
    setLiveVoiceMessages([]);
  }

  function closeVoiceMode() {
    setVoiceOpen(false);
    setVoiceMinimized(false);
    setLiveVoiceMessages([]);
    void loadHistory();
  }

  if (!token) {
    return (
      <main className="launch-screen">
        <section className="launch-content" aria-label="Start real estate assistant">
          <div className="brand-mark">ESTATIQ</div>
          <div className="launch-orb" aria-hidden="true" />
          <h1>Islamabad real estate intelligence.</h1>
          <p>Ask about Islamabad sectors, pricing, availability, and market context.</p>
          <button className="launch-button" onClick={startConversation}>
            Initialize session
          </button>
        </section>
      </main>
    );
  }

  return (
      <LiveKitRoom
      token={token}
      serverUrl={LIVEKIT_URL}
      connect={voiceOpen}
      audio={true}
      video={false}
    >
      <RoomAudioRenderer />
      <LiveTranscriptionBridge
        enabled={voiceOpen}
        onMessages={setLiveVoiceMessages}
      />

      <div className="app-shell">
        <Sidebar
          activeRoomName={roomName}
          conversations={conversations}
          isOpen={sidebarOpen}
          onClose={() => setSidebarOpen(false)}
          onNewChat={startConversation}
          onSelectConversation={selectConversation}
        />

        <main className="chat-shell">
          <TopBar
            title={title}
            sidebarOpen={sidebarOpen}
            onToggleSidebar={() => setSidebarOpen((current) => !current)}
          />
          <ChatWindow
            isStreaming={isSendingText}
            messages={visibleMessages}
            onSuggestionClick={handleSendText}
          />
          <InputBar
            isRecording={voiceOpen}
            isSending={isSendingText}
            onMicClick={openVoiceMode}
            onSend={handleSendText}
          />
        </main>

        {voiceOpen && (
          <OrbOverlay
            audioState={audioState}
            isMinimized={voiceMinimized}
            onClose={closeVoiceMode}
            onExpand={() => setVoiceMinimized(false)}
            onMinimize={() => setVoiceMinimized(true)}
          />
        )}
      </div>
    </LiveKitRoom>
  );
}
