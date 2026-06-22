import { useState, useRef, useEffect, useMemo } from "react";
import { renderMarkdown } from "../lib/markdown";

interface Props { contextText: string | null; onSend: (question: string) => void; isLoading: boolean; }

const MAX_ROWS = 10;

/** Balance inline-math `$` delimiters for partial-selection edge cases. */
function balanceMath(text: string): string {
  const n = (text.match(/\$/g) || []).length;
  return n % 2 === 0 ? text : text + "$";
}

export function QuestionInputBar({ contextText, onSend, isLoading }: Props) {
  const [question, setQuestion] = useState("");
  const taRef = useRef<HTMLTextAreaElement>(null);

  // contextText is now real markdown source (with LaTeX) from extractSelectionSource
  const contextHtml = useMemo(() => {
    if (!contextText) return null;
    return renderMarkdown(balanceMath(contextText));
  }, [contextText]);

  useEffect(() => {
    const ta = taRef.current;
    if (ta) {
      ta.style.height = "auto";
      const lineHeight = parseFloat(getComputedStyle(ta).lineHeight) || 21;
      const maxHeight = lineHeight * MAX_ROWS;
      const h = Math.min(ta.scrollHeight, maxHeight);
      ta.style.height = h + "px";
      ta.style.overflowY = ta.scrollHeight > maxHeight ? "auto" : "hidden";
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
      {contextHtml ? (
        <div className="context-badge" title={contextText || ""}>
          <div dangerouslySetInnerHTML={{ __html: contextHtml }} />
        </div>
      ) : (
        <span className="context-label">Free ask</span>
      )}
      <div className="input-row">
        <textarea
          ref={taRef}
          placeholder={contextText ? `About: ${contextText.slice(0, 40)}...` : "Ask anything..."}
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey && !e.ctrlKey && !e.metaKey) {
              e.preventDefault();
              handleSend();
            }
          }}
          disabled={isLoading}
          rows={2}
        />
        <button onClick={handleSend} disabled={isLoading || !question.trim()}>
          {isLoading ? "..." : "Send"}
        </button>
      </div>
    </div>
  );
}
