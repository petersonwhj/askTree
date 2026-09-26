import { useState, useRef, useEffect, useMemo } from "react";
import type { AskImage } from "@asktree/core";
import { renderMarkdown } from "../lib/markdown";
import { fileToAskImage } from "../lib/image";
import { ImageLightbox } from "./ImageLightbox";

export type AskTarget = "left" | "right";

/** Inline paperclip icon (the 📎 emoji renders inconsistently across fonts). */
function PaperclipIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

interface Props {
  contextText: string | null;
  rawText?: string | null;  // raw markdown slice for proper math rendering
  onSend: (question: string, images: AskImage[]) => void;
  onClearContext?: () => void;
  isLoading: boolean;
  freeAskTarget?: "left" | "right";
  onFreeAskTargetChange?: (target: "left" | "right") => void;
  showFreeAskTarget?: boolean;
  contextSide?: "left" | "right" | null;
  onRequestSuggestions?: () => Promise<string[]>;
  onOpenSettings?: () => void;
  onDebugSuggestions?: () => void;
}

const MAX_ROWS = 10;

function balanceMath(text: string): string {
  const n = (text.match(/\$/g) || []).length;
  return n % 2 === 0 ? text : text + "$";
}

export function QuestionInputBar({
  contextText,
  rawText,
  onSend,
  onClearContext,
  isLoading,
  freeAskTarget = "right",
  onFreeAskTargetChange,
  showFreeAskTarget = true,
  contextSide = null,
  onRequestSuggestions,
  onOpenSettings,
  onDebugSuggestions,
}: Props) {
  const [question, setQuestion] = useState("");
  const taRef = useRef<HTMLTextAreaElement>(null);
  const [images, setImages] = useState<AskImage[]>([]);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<string | null>(null);

  const addFiles = async (files: File[]) => {
    const imageFiles = files.filter((f) => f.type.startsWith("image/"));
    if (imageFiles.length === 0) return;
    const added = await Promise.all(imageFiles.map(fileToAskImage));
    setImages((prev) => [...prev, ...added]);
  };

  const handlePaste = (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const files = Array.from(e.clipboardData?.items ?? [])
      .filter((item) => item.kind === "file" && item.type.startsWith("image/"))
      .map((item) => item.getAsFile())
      .filter((f): f is File => f !== null);
    if (files.length > 0) {
      e.preventDefault();
      void addFiles(files);
    }
  };

  const [showSuggest, setShowSuggest] = useState(false);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [suggestLoading, setSuggestLoading] = useState(false);
  const [suggestError, setSuggestError] = useState<string | null>(null);

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

  // The selected passage / free-ask target changed: stale suggestions no longer apply.
  useEffect(() => {
    setShowSuggest(false);
    setSuggestions([]);
    setSuggestError(null);
  }, [contextText, rawText, freeAskTarget]);

  const handleSend = () => {
    if (!question.trim() || isLoading) return;
    onSend(question.trim(), images);
    setQuestion("");
    setImages([]);
  };

  const loadSuggestions = async () => {
    if (!onRequestSuggestions) return;
    setSuggestLoading(true);
    setSuggestError(null);
    try {
      const next = await onRequestSuggestions();
      setSuggestions(next);
    } catch (e) {
      setSuggestError((e as Error).message || "Failed to generate questions");
    } finally {
      setSuggestLoading(false);
    }
  };

  const toggleSuggest = () => {
    if (showSuggest) {
      setShowSuggest(false);
      return;
    }
    setShowSuggest(true);
    if (suggestions.length === 0 && !suggestLoading) {
      void loadSuggestions();
    }
  };

  const chooseSuggestion = (text: string) => {
    setShowSuggest(false);
    onSend(text, images);
    setImages([]);
  };

  const handleClear = () => {
    setQuestion("");
    setImages([]);
    setShowSuggest(false);
    setSuggestions([]);
    setSuggestError(null);
    onClearContext?.();
  };

  return (
    <div className="question-input-bar">
      {contextHtml ? (
        <div className="context-row">
          {contextSide && (
            <span className="context-panel-label">
              {contextSide === "left" ? "Left panel" : "Right panel"}
            </span>
          )}
          <div className="context-badge" title={contextText || rawText || ""}>
            <div dangerouslySetInnerHTML={{ __html: contextHtml }} />
          </div>
        </div>
      ) : (
        <div className="free-ask-row">
          <span className="context-label">Free ask</span>
          {showFreeAskTarget && (
            <div className="free-ask-toggle" role="group" aria-label="Ask target">
              <button
                type="button"
                className={`free-ask-option${freeAskTarget === "left" ? " active" : ""}`}
                aria-pressed={freeAskTarget === "left"}
                onClick={() => onFreeAskTargetChange?.("left")}
              >
                ◀ Left
              </button>
              <button
                type="button"
                className={`free-ask-option${freeAskTarget === "right" ? " active" : ""}`}
                aria-pressed={freeAskTarget === "right"}
                onClick={() => onFreeAskTargetChange?.("right")}
              >
                Right ▶
              </button>
            </div>
          )}
        </div>
      )}

      {showSuggest && (
        <div className="suggest-panel">
          <div className="suggest-header">
            <span className="suggest-title">Suggested questions</span>
            <div className="suggest-actions">
              {onDebugSuggestions && (
                <button
                  type="button"
                  className="suggest-action"
                  aria-label="Debug suggested questions"
                  title="查看建议提问的 prompt"
                  onClick={onDebugSuggestions}
                >
                  ?
                </button>
              )}
              <button
                type="button"
                className="suggest-action"
                aria-label="Refresh suggestions"
                title="换一批"
                onClick={() => void loadSuggestions()}
                disabled={suggestLoading}
              >
                ↻
              </button>
              <button
                type="button"
                className="suggest-action"
                aria-label="Close suggestions"
                title="退出"
                onClick={() => setShowSuggest(false)}
              >
                ✕
              </button>
            </div>
          </div>

          {suggestLoading ? (
            <div className="suggest-loading">Generating questions…</div>
          ) : suggestError ? (
            <div className="suggest-error">
              <span>{suggestError}</span>
              {onOpenSettings && (
                <button type="button" className="suggest-settings" onClick={onOpenSettings}>
                  Open Settings
                </button>
              )}
            </div>
          ) : (
            <ul className="suggest-list">
              {suggestions.map((q, i) => (
                <li key={i}>
                  <button type="button" className="suggest-item" onClick={() => chooseSuggestion(q)}>
                    {q}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {images.length > 0 && (
        <div className="ask-images">
          {images.map((img, i) => (
            <div className="ask-image" key={i}>
              <img
                src={`data:${img.mediaType};base64,${img.data}`}
                alt="attached"
                title="Click to preview"
                onClick={() => setPreview(`data:${img.mediaType};base64,${img.data}`)}
              />
              <button
                type="button"
                aria-label="Remove image"
                title="Remove image"
                onClick={() => setImages((prev) => prev.filter((_, j) => j !== i))}
              >
                ✕
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="bar-tools">
        <button
          type="button"
          className="bar-tool"
          aria-label="Attach image"
          title="附件"
          onClick={() => imageInputRef.current?.click()}
        >
          <PaperclipIcon /> 附件
        </button>
        <button
          type="button"
          className="bar-tool"
          aria-label="Clear context"
          title="清空问题、附件与选中文字"
          onClick={handleClear}
        >
          ✕ 清空
        </button>
        <input
          ref={imageInputRef}
          type="file"
          accept="image/*"
          multiple
          style={{ display: "none" }}
          onChange={(e) => {
            void addFiles(Array.from(e.target.files ?? []));
            e.target.value = "";
          }}
        />
      </div>

      <div className="input-box">
        <textarea
          ref={taRef}
          placeholder={contextText ? `About: ${contextText.slice(0, 40)}...` : "Ask anything..."}
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          onPaste={handlePaste}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey && !e.ctrlKey && !e.metaKey) {
              e.preventDefault();
              handleSend();
            }
          }}
          disabled={isLoading}
          rows={2}
        />
        <div className="input-toolbar">
          <button
            type="button"
            className={`assist-btn${showSuggest ? " active" : ""}`}
            aria-label="Suggest a question"
            aria-expanded={showSuggest}
            title="帮我提问"
            onClick={toggleSuggest}
            disabled={!onRequestSuggestions}
          >
            💡
          </button>
          <button
            type="button"
            className="send-btn"
            onClick={handleSend}
            disabled={isLoading || !question.trim()}
          >
            {isLoading ? "..." : "Send"}
          </button>
        </div>
      </div>

      {preview && <ImageLightbox src={preview} onClose={() => setPreview(null)} />}
    </div>
  );
}
