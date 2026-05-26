import { useState } from "react";

interface Props { contextText: string | null; onSend: (question: string) => void; isLoading: boolean; }

export function QuestionInputBar({ contextText, onSend, isLoading }: Props) {
  const [question, setQuestion] = useState("");

  const handleSend = () => {
    if (!question.trim() || isLoading) return;
    onSend(question.trim());
    setQuestion("");
  };

  return (
    <div className="question-input-bar">
      {contextText ? (
        <span className="context-badge" title={contextText}>
          "{contextText.slice(0, 30)}{contextText.length > 30 ? "..." : ""}"
        </span>
      ) : (
        <span style={{ fontSize: 12, color: "#484f58", flexShrink: 0 }}>Free ask</span>
      )}
      <input
        type="text"
        placeholder={contextText ? `About "${contextText.slice(0, 30)}"...` : "Ask anything..."}
        value={question}
        onChange={(e) => setQuestion(e.target.value)}
        onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
        disabled={isLoading}
      />
      <button onClick={handleSend} disabled={isLoading || !question.trim()}>
        {isLoading ? "..." : "Send"}
      </button>
    </div>
  );
}
