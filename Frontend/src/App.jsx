import { useState, useEffect, useRef } from "react";
import {
  LiveKitRoom,
  RoomAudioRenderer,
} from "@livekit/components-react";

import "@livekit/components-styles";

import "./App.css";

const API_URL =
  "https://athletic-learning-production.up.railway.app";

export default function App() {
  const [token, setToken] = useState(null);
  const [roomName, setRoomName] = useState("");
  const [messages, setMessages] = useState([]);
  const [voiceMode, setVoiceMode] = useState(true);
  const [mode, setMode] = useState("voice");
  const [input, setInput] = useState("");
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const messagesEndRef = useRef(null);
  const [conversations, setConversations] = useState([]);

  async function startConversation() {
    try {
      const room = `room-${Date.now()}`;
      setRoomName(room);

      const response = await fetch(
        `${API_URL}/api/livekit-token`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            room_name: room,
            identity: `user-${Date.now()}`,
          }),
        }
      );

      const data = await response.json();
      setToken(data.token);
    } catch (err) {
      console.error(err);
      alert("Failed to connect");
    }
  }

  async function loadHistory() {
    if (!roomName) return;
    try {
      const response = await fetch(
        `${API_URL}/api/history/${roomName}`
      );
      const data = await response.json();
      setMessages(data);
    } catch (err) {
      console.error(err);
    }
  }

  async function loadConversations() {
  try {
    const response = await fetch(
      `${API_URL}/api/conversations`
    );

    const data = await response.json();

    setConversations(data);
  } catch (err) {
    console.error(err);
  }
}

  useEffect(() => {
    if (!roomName) return;
    loadHistory();
    const interval = setInterval(loadHistory, 2000);
    return () => clearInterval(interval);
  }, [roomName]);

  useEffect(() => {
  loadConversations();
  }, []);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  function toggleVoice() {
    setMode((prev) => {
      if (prev === "chat") return "hybrid";
      if (prev === "hybrid") return "chat";
      if (prev === "voice") return "chat";
      return "chat";
    });
  }

  function formatTime(ts) {
    if (!ts) return "";
    const d = new Date(ts);
    return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  }

  // Landing screen
  if (!token) {
    return (
      <div className="app">
        <div className="grid-bg" />
        <div className="orb-container">
          <div className="orb-glow-ring" />
          <div className="orb">
            <div className="orb-inner" />
          </div>
          <div className="brand-label">ISLAMABAD ESTATE AI</div>
          <h1 className="landing-title">Your Intelligent<br />Property Assistant</h1>
          <p className="landing-sub">Powered by real-time market intelligence</p>
          <button className="connect-btn" onClick={startConversation}>
            <span className="btn-icon">▶</span>
            Initialize Session
          </button>
          <div className="landing-status">
            <span className="status-dot" />
            SYSTEM READY
          </div>
        </div>
      </div>
    );
  }

  return (
    <LiveKitRoom
      token={token}
      serverUrl="wss://test-1-euow2v8o.livekit.cloud"
      connect={true}
      audio={true}
      video={false}
    >
      <RoomAudioRenderer />

      <div className="dashboard">
        {/* Sidebar */}
        <aside className={`sidebar${sidebarOpen ? "" : " collapsed"}`}>
          <div className="sidebar-header">
            <button className="menu-btn" onClick={() => setSidebarOpen(!sidebarOpen)}>
              <span className="menu-icon">
                <span /><span /><span />
              </span>
            </button>
            {sidebarOpen && (
              <span className="sidebar-brand">ISLAMABAD ESTATE AI</span>
            )}
          </div>

          {sidebarOpen && (
            <>
              <button className="new-chat-btn" onClick={startConversation}>
                <span>＋</span> New Chat
              </button>

              <div className="history-section">
                <div className="history-label">Recents</div>
                <div className="history-list">
                 {conversations.map((conv) => (
  <div
    key={conv.room_name}
    className="history-item"
    onClick={() => setRoomName(conv.room_name)}
    
  >
    <span className="history-icon">💬</span>
    {conv.title}
  </div>
))}
                </div>
              </div>

              <div className="sidebar-footer">
                <div className="sidebar-mode-btns">
                  <button
                    className={`mode-pill${mode === "voice" || mode === "hybrid" ? " active" : ""}`}
                    onClick={() => setMode(mode === "voice" ? "chat" : "voice")}
                  >
                    🎙 Voice
                  </button>
                  <button
                    className={`mode-pill${mode === "chat" ? " active" : ""}`}
                    onClick={() => setMode("chat")}
                  >
                    💬 Chat
                  </button>
                </div>
              </div>
            </>
          )}
        </aside>

        {/* Main chat area */}
        <main className="chat-area">
          <div className="chat-topbar">
            <div className="topbar-title">
              {mode === "voice" ? "Voice Mode" : "Chat Mode"}
            </div>
            <div className="topbar-actions">
              <button className="icon-btn" title="Notifications">🔔</button>
              <button className="icon-btn" title="Profile">👤</button>
            </div>
          </div>

          {/* Voice screen */}
          {mode === "voice" ? (
            <div className="voice-screen">
              <div className="orb-glow-ring large" />
              <div className="orb large">
                <div className="orb-inner" />
              </div>
              <h2 className="voice-label">Listening...</h2>
              <p className="voice-sub">Speak to query the property database</p>
              <button className="switch-btn" onClick={() => setMode("chat")}>
                Switch to Chat
              </button>
            </div>
          ) : (
            <>
              {/* Transcript / messages */}
              <div className="messages-area">
                {messages.length === 0 && (
                  <div className="empty-state">
                    <div className="empty-orb">
                      <div className="orb small">
                        <div className="orb-inner" />
                      </div>
                    </div>
                    <p>AI Unit initialized. Ask about properties, trends, or investment analysis.</p>
                  </div>
                )}

                {messages.map((msg, index) => (
                  <div
                    key={index}
                    className={`message-row ${msg.role === "user" ? "user-row" : "ai-row"}`}
                  >
                    {msg.role !== "user" && (
                      <div className="avatar ai-avatar">AI</div>
                    )}
                    <div className={`bubble ${msg.role === "user" ? "user-bubble" : "ai-bubble"}`}>
                      <div className="bubble-text">{msg.text}</div>
                      {msg.timestamp && (
                        <div className="bubble-meta">
                          {msg.role === "user" ? "USER" : "AI UNIT 01"} // {formatTime(msg.timestamp)}
                        </div>
                      )}
                    </div>
                    {msg.role === "user" && (
                      <div className="avatar user-avatar">U</div>
                    )}
                  </div>
                ))}
                <div ref={messagesEndRef} />
              </div>

              {/* Hybrid mini orb */}
              {mode === "hybrid" && (
                <div className="mini-orb-wrap">
                  <div className="orb small">
                    <div className="orb-inner" />
                  </div>
                  <span className="mini-orb-label">Voice Active</span>
                </div>
              )}

              {/* Input bar */}
              <div className="input-bar-wrapper">
                <div className="input-bar">
                  <button
                    className={`voice-toggle${mode === "hybrid" ? " voice-active" : ""}`}
                    onClick={toggleVoice}
                    title={mode === "hybrid" ? "Disable voice" : "Enable voice"}
                  >
                    🎤
                  </button>
                  <input
                    className="chat-input"
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && setInput("")}
                    placeholder="Command AI... (e.g., 'Compare ROI in sectors 4 and 9')"
                  />
                  <button
                    className="send-btn"
                    onClick={() => setInput("")}
                    title="Send"
                  >
                    ▶
                  </button>
                </div>
                <div className="input-status-bar">
                  <span className="status-item">
                    <span className="status-dot green" /> SYSTEM: ONLINE
                  </span>
                  <span className="status-item">
                    <span className="status-dot cyan" /> AGENT: LISTENING
                  </span>
                  <span className="status-item">
                    <span className="status-dot yellow" /> ⚡ NEURAL PROCESSING
                  </span>
                </div>
              </div>
            </>
          )}
        </main>
      </div>
    </LiveKitRoom>
  );
}
