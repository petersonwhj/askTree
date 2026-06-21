import { useRef, useState, useEffect, useCallback } from "react";
import { renderMarkdown } from "../lib/markdown";
import { FloatingAskButton } from "./FloatingAskButton";

interface Props {
  content: string;
  highlights?: Array<{ startPos: number; endPos: number; nodeId: string }>;
  highlight?: { start: number; end: number } | null;
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

export function MarkdownPane({ content, onTextSelected, highlight }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const [floatingPos, setFloatingPos] = useState<{ text: string; top: number; left: number } | null>(null);
  const [selectionRange, setSelectionRange] = useState<{ text: string; start: number; end: number } | null>(null);

  useEffect(() => {
    if (contentRef.current) {
      contentRef.current.innerHTML = renderMarkdown(content);
      if (highlight && highlight.start >= 0 && highlight.end > highlight.start) {
        applyHighlight(contentRef.current, highlight.start, highlight.end);
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
