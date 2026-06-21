import { useRef, useState, useEffect, useCallback } from "react";
import { renderMarkdown } from "../lib/markdown";
import { FloatingAskButton } from "./FloatingAskButton";

interface Props {
  content: string;
  highlights?: Array<{ startPos: number; endPos: number; nodeId: string }>;
  highlight?: { start: number; end: number; text?: string } | null;
  onTextSelected: (text: string, startPos: number, endPos: number) => void;
}

function applyHighlight(root: HTMLElement, start: number, end: number) {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let offset = 0;
  const nodes: Array<{ node: Text; start: number; end: number }> = [];
  while (walker.nextNode()) {
    const node = walker.currentNode as Text;
    const len = node.textContent?.length || 0;
    const nodeStart = offset;
    const nodeEnd = offset + len;
    if (nodeEnd > start && nodeStart < end) {
      nodes.push({
        node,
        start: Math.max(0, start - nodeStart),
        end: Math.min(len, end - nodeStart),
      });
    }
    offset += len;
    if (offset > end) break;
  }
  for (const { node, start: s, end: e } of nodes) {
    const range = document.createRange();
    range.setStart(node, s);
    range.setEnd(node, e);
    const mark = document.createElement("mark");
    mark.className = "asktree-highlight";
    range.surroundContents(mark);
  }
}

function getTextOffset(container: Node, targetNode: Node, targetOffset: number): number {
  const range = document.createRange();
  range.setStart(container, 0);
  range.setEnd(targetNode, targetOffset);
  return range.toString().length;
}

/**
 * Find the occurrence of `needle` in `haystack` whose proportional position
 * is closest to `refPos / refLen`. Used to map between rendered and raw
 * coordinate systems.
 */
function findClosestOccurrence(
  haystack: string,
  needle: string,
  refLen: number,
  refPos: number,
): number {
  if (!needle) return -1;
  let bestIdx = -1;
  let bestDist = Infinity;
  const targetRatio = refLen > 0 ? refPos / refLen : 0;
  let searchFrom = 0;

  while (true) {
    const idx = haystack.indexOf(needle, searchFrom);
    if (idx === -1) break;
    const ratio = haystack.length > 0 ? idx / haystack.length : 0;
    const dist = Math.abs(ratio - targetRatio);
    if (dist < bestDist) {
      bestDist = dist;
      bestIdx = idx;
    }
    searchFrom = idx + 1;
  }

  return bestIdx;
}

/**
 * Map a rendered-text offset to the corresponding raw-markdown offset
 * by locating the selected text in the raw source, using proportional
 * position as a tie-breaker when the text appears multiple times.
 */
function renderedToRawOffset(
  rawContent: string,
  renderedText: string,
  renderedOffset: number,
  selectedText: string,
): { start: number; end: number } {
  const rawIdx = findClosestOccurrence(rawContent, selectedText, renderedText.length, renderedOffset);
  if (rawIdx >= 0) {
    return { start: rawIdx, end: rawIdx + selectedText.length };
  }
  // Fallback: proportional estimate
  const ratio = renderedText.length > 0 ? renderedOffset / renderedText.length : 0;
  const est = Math.round(rawContent.length * ratio);
  return { start: est, end: est + selectedText.length };
}

/**
 * Map a raw-markdown offset to the corresponding rendered-text offset
 * (the reverse of renderedToRawOffset). Used when applying highlights
 * that were stored as raw offsets (#13) to the rendered DOM.
 */
function rawToRenderedOffset(
  rawContent: string,
  renderedText: string,
  rawOffset: number,
  selectedText: string,
): number {
  const renderedIdx = findClosestOccurrence(renderedText, selectedText, rawContent.length, rawOffset);
  if (renderedIdx >= 0) {
    return renderedIdx;
  }
  // Fallback: proportional estimate
  const ratio = rawContent.length > 0 ? rawOffset / rawContent.length : 0;
  return Math.round(renderedText.length * ratio);
}

export function MarkdownPane({ content, onTextSelected, highlight }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const [floatingPos, setFloatingPos] = useState<{ text: string; top: number; left: number } | null>(null);
  const [selectionRange, setSelectionRange] = useState<{ text: string; start: number; end: number } | null>(null);

  useEffect(() => {
    if (contentRef.current) {
      contentRef.current.innerHTML = renderMarkdown(content);
      if (highlight && highlight.start >= 0 && highlight.end > highlight.start) {
        let displayStart = highlight.start;
        let displayEnd = highlight.end;

        // If selection text is available, map raw offset → rendered offset
        // so the highlight lands on the correct rendered text position
        if (highlight.text) {
          const renderedText = contentRef.current.textContent || "";
          displayStart = rawToRenderedOffset(
            content, renderedText, highlight.start, highlight.text,
          );
          displayEnd = displayStart + highlight.text.length;
        }

        if (displayStart >= 0 && displayEnd > displayStart) {
          applyHighlight(contentRef.current, displayStart, displayEnd);
        }
      }
    }
  }, [content, highlight]);

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

    setFloatingPos({
      text,
      top: rect.bottom + 4,
      left: rect.left + rect.width / 2 - 60,
    });

    const contentEl = contentRef.current;
    if (contentEl && sel.anchorNode && sel.focusNode) {
      try {
        // Get offset in rendered DOM text
        const renderedStart = getTextOffset(contentEl, sel.anchorNode, sel.anchorOffset);
        const renderedEnd = getTextOffset(contentEl, sel.focusNode, sel.focusOffset);
        const renderedPos = Math.min(renderedStart, renderedEnd);

        // Get the rendered text content
        const renderedText = contentEl.textContent || "";

        // Map rendered offset → raw markdown offset using text search
        const raw = renderedToRawOffset(content, renderedText, renderedPos, text);
        setSelectionRange({ text, start: raw.start, end: raw.end });
      } catch {
        // Fallback: search in raw content directly
        const s = content.indexOf(text);
        setSelectionRange({ text, start: s, end: s >= 0 ? s + text.length : 0 });
      }
    }
  }, [content]);

  useEffect(() => {
    document.addEventListener("mouseup", handleSelection);
    return () => document.removeEventListener("mouseup", handleSelection);
  }, [handleSelection]);

  const handleAsk = () => {
    if (selectionRange && selectionRange.start >= 0) {
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
