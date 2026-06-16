import "./App.css";

function App() {
  return (
    <div className="app">
      <aside className="sidebar">
        <h2>🏠 Real Estate AI</h2>

        <button className="new-chat">
          + New Chat
        </button>

        <div className="chat-history">
          <div className="chat-item">DHA Phase 2 Inquiry</div>
          <div className="chat-item">E-7 House Prices</div>
          <div className="chat-item">Rental Search</div>
        </div>
      </aside>

      <main className="main">
        <header className="header">
          Islamabad Real Estate AI Assistant
        </header>

        <div className="messages">
          <div className="message ai">
            Assalam-o-Alaikum! How can I help you today?
          </div>

          <div className="message user">
            What is the price of a 1 Kanal house in DHA Phase 2?
          </div>

          <div className="message ai">
            Based on our property database, the price range is
            PKR 8 Crore to 15 Crore.
          </div>
        </div>

        <div className="input-area">
          <input
            type="text"
            placeholder="Ask about properties..."
          />
          <button>Send</button>
        </div>
      </main>
    </div>
  );
}

export default App;