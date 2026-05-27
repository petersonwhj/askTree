import { useRef, useState, useEffect, useCallback } from "react";
import { renderMarkdown } from "../lib/markdown";
import { FloatingAskButton } from "./FloatingAskButton";

interface Props {
  content: string;
  highlights?: Array<{ startPos: number; endPos: number; nodeId: string }>;
  onTextSelected: (text: string, startPos: number, endPos: number) => void;
}

function getTextOffset(container: Node, targetNode: Node, targetOffset: number): number {
  const range = document.createRange();
  range.setStart(container, 0);
  range.setEnd(targetNode, targetOffset);
  return range.toString().length;
}

export function MarkdownPane({ content, onTextSelected }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const [floatingPos, setFloatingPos] = useState<{ text: string; top: number; left: number } | null>(null);
  const [selectionRange, setSelectionRange] = useState<{ text: string; start: number; end: number } | null>(null);

  useEffect(() => {
    if (contentRef.current) {
      contentRef.current.innerHTML = renderMarkdown(content);
    }
  }, [content]);

  const handleSelection = useCallback(() => {
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed || !containerRef.current?.contains(sel.anchorNode)) {
      setFloatingPos(null);
      setSelectionRange(null);
      return;
    }

    const range = sel.getRangeAt(0);
    const text = sel.toString().trim();
    if (!text || text.length > 500) {
      setFloatingPos(null);
      setSelectionRange(null);
      return;
    }

    const rect = range.getBoundingClientRect();
    const containerRect = containerRef.current.getBoundingClientRect();

    setFloatingPos({
      text,
      top: rect.bottom - containerRect.top + 4,
      left: rect.left - containerRect.left + rect.width / 2 - 60,
    });

    const contentEl = contentRef.current;
    if (contentEl) {
      const start = getTextOffset(contentEl, sel.anchorNode, sel.anchorOffset);
      const end = getTextOffset(contentEl, sel.focusNode, sel.focusOffset);
      setSelectionRange({ text, start: Math.min(start, end), end: Math.max(start, end) });
    }
  }, []);

  useEffect(() => {
    document.addEventListener("mouseup", handleSelection);
    return () => document.removeEventListener("mouseup", handleSelection);
  }, [handleSelection]);

  const handleAsk = () => {
    if (selectionRange) {
      onTextSelected(selectionRange.text, selectionRange.start, selectionRange.end);
      setFloatingPos(null);
      setSelectionRange(null);
      window.getSelection()?.removeAllRanges();
    }
  };

  return (
    <div className="markdown-pane" ref={containerRef}>
      <div ref={contentRef} />
      {floatingPos && (
        <FloatingAskButton
          text={floatingPos.text}
          top={floatingPos.top}
          left={floatingPos.left}
          onAsk={handleAsk}
        />
      )}
    </div>
  );
}
