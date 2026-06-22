import { useState, useRef, useEffect, useMemo } from "react";
import { renderMarkdown } from "../lib/markdown";

interface Props {
  contextText: string | null;
  rawText?: string | null;  // raw markdown slice for proper math rendering
  onSend: (question: string) => void;
  isLoading: boolean;
}

const MAX_ROWS = 10;

function balanceMath(text: string): string {
  const n = (text.match(/\$/g) || []).length;
  return n % 2 === 0 ? text : text + "$";
}

export function QuestionInputBar({ contextText, rawText, onSend, isLoading }: Props) {
  const [question, setQuestion] = useState("");
  const taRef = useRef<HTMLTextAreaElement>(null);

  // Use rawText for rendering when available (preserves $..$ for KaTeX).
  // Fall back to contextText (DOM text) for plain prose.
  const contextHtml = useMemo(() => {
    const src = rawText || contextText;
    if (!src) return null;
    return renderMarkdown(balanceMath(src));
  }, [rawText, contextText]);

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
        <div className="context-badge" title={contextText || rawText || ""}>
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
