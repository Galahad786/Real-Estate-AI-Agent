const SUGGESTIONS = [
  "Tell me about D-12",
  "Compare E-11 and G-13",
  "Best Islamabad sectors under 4 Crore",
];

export default function SuggestionChips({ onSuggestionClick }) {
  return (
    <div className="suggestion-chips">
      {SUGGESTIONS.map((suggestion) => (
        <button
          key={suggestion}
          className="suggestion-chip"
          type="button"
          onClick={() => onSuggestionClick(suggestion)}
        >
          {suggestion}
        </button>
      ))}
    </div>
  );
}
