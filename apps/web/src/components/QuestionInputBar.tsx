import { useState, useRef, useEffect } from "react";

interface Props { contextText: string | null; onSend: (question: string) => void; isLoading: boolean; }

export function QuestionInputBar({ contextText, onSend, isLoading }: Props) {
  const [question, setQuestion] = useState("");
  const taRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const ta = taRef.current;
    if (ta) {
      ta.style.height = "auto";
      ta.style.height = ta.scrollHeight + "px";
    }
  }, [question]);

  useEffect(() => {
    if (contextText && taRef.current) {
      taRef.current.focus();
    }
  }, [contextText]);

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
        <span className="context-label">Free ask</span>
      )}
      <textarea
        ref={taRef}
        placeholder={contextText ? `About "${contextText.slice(0, 30)}"...` : "Ask anything..."}
        value={question}
        onChange={(e) => setQuestion(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey && !e.ctrlKey && !e.metaKey) {
            e.preventDefault();
            handleSend();
          }
        }}
        disabled={isLoading}
        rows={1}
      />
      <button onClick={handleSend} disabled={isLoading || !question.trim()}>
        {isLoading ? "..." : "Send"}
      </button>
    </div>
  );
}
