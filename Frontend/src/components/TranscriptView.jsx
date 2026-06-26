import ChatWindow from "./ChatWindow";

export default function TranscriptView({ messages, onBack, onClose }) {
  return (
    <section className="transcript-view" aria-label="Voice transcript">
      <header className="transcript-header">
        <button className="transcript-toggle" type="button" onClick={onBack}>
          Back to orb
        </button>
        <button className="end-call-button" type="button" onClick={onClose}>
          x
        </button>
      </header>

      <ChatWindow messages={messages} onSuggestionClick={() => {}} compact />
    </section>
  );
}
