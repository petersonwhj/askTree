import { useRef, useState, useEffect, useCallback } from "react";
import { renderMarkdown } from "../lib/markdown";
import { FloatingAskButton } from "./FloatingAskButton";

interface Props {
  content: string;
  highlights?: Array<{ startPos: number; endPos: number; nodeId: string }>;
  highlight?: { start: number; end: number; text?: string } | null;
  onTextSelected: (text: string, startPos: number, endPos: number) => void;
}

/**
 * Walk text nodes and wrap each overlapping slice in a <mark>.
 * Per-node ranges avoid cross-element surroundContents failures.
 */
function applyHighlight(root: HTMLElement, start: number, end: number) {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let offset = 0;
  const targets: Array<{ node: Text; s: number; e: number }> = [];
  while (walker.nextNode()) {
    const node = walker.currentNode as Text;
    const len = node.textContent?.length || 0;
    const nodeStart = offset;
    const nodeEnd = offset + len;
    if (nodeEnd > start && nodeStart < end) {
      targets.push({
        node,
        s: Math.max(0, start - nodeStart),
        e: Math.min(len, end - nodeStart),
      });
    }
    offset += len;
    if (offset > end) break;
  }
  for (const { node, s, e } of targets) {
    if (s >= e) continue;
    try {
      const range = document.createRange();
      range.setStart(node, s);
      range.setEnd(node, e);
      const mark = document.createElement("mark");
      mark.className = "asktree-highlight";
      range.surroundContents(mark);
    } catch {
      // Node boundary changed (e.g. Katex re-render) — skip this node
    }
  }
}

/** Offset in the rendered DOM text for a given node + offset within it */
function getTextOffset(container: Node, targetNode: Node, targetOffset: number): number {
  const range = document.createRange();
  range.setStart(container, 0);
  range.setEnd(targetNode, targetOffset);
  return range.toString().length;
}

/** Full rendered text length from a container */
function getRenderedLength(container: Node): number {
  const range = document.createRange();
  range.setStart(container, 0);
  range.setEnd(container, container.childNodes.length);
  return range.toString().length;
}

/**
 * Bridge function for both mapping directions.
 * Find the occurrence of `needle` in `haystack` whose position is
 * proportionally closest to `refPos / refLen`.  Returns -1 when no
 * exact match exists (e.g. math formatting chars differ).
 */
function findClosestOccurrence(
  haystack: string,
  needle: string,
  refLen: number,
  refPos: number,
): number {
  if (!needle) return -1;
  const approx = refLen > 0
    ? Math.round((refPos / refLen) * haystack.length)
    : 0;
  let bestIdx = -1;
  let bestDist = Infinity;
  let searchFrom = 0;

  while (true) {
    const idx = haystack.indexOf(needle, searchFrom);
    if (idx === -1) break;
    const dist = Math.abs(idx - approx);
    if (dist < bestDist) {
      bestDist = dist;
      bestIdx = idx;
    }
    searchFrom = idx + 1;
  }

  return bestIdx;
}

/**
 * Map rendered-text offsets → raw-markdown offsets.
 * Uses the text string as the primary bridge; the proportional position
 * from the other system is only a tie-breaker for repeats.
 * Falls back to a two-point proportional estimate when the text cannot
 * be located (e.g. the selection spans LaTeX math whose rendered glyphs
 * differ from the raw `\$…\$` syntax).
 */
function renderedToRawOffsets(
  rawContent: string,
  renderedText: string,
  renderedStart: number,
  renderedEnd: number,
  selectedText: string,
): { start: number; end: number } {
  const rawIdx = findClosestOccurrence(rawContent, selectedText, renderedText.length, renderedStart);
  if (rawIdx >= 0) {
    return { start: rawIdx, end: rawIdx + selectedText.length };
  }

  // Exact match failed — two-point proportional fallback
  const rLen = renderedText.length || 1;
  return {
    start: Math.round((renderedStart / rLen) * rawContent.length),
    end:   Math.round((renderedEnd   / rLen) * rawContent.length),
  };
}

/**
 * Map raw-markdown offsets → rendered-text offsets (reverse direction).
 * Same text-first / proportional-fallback strategy.
 */
function rawToRenderedOffsets(
  rawContent: string,
  renderedText: string,
  rawStart: number,
  rawEnd: number,
  storedText: string,
): { start: number; end: number } {
  const renderedIdx = findClosestOccurrence(renderedText, storedText, rawContent.length, rawStart);
  if (renderedIdx >= 0) {
    return { start: renderedIdx, end: renderedIdx + storedText.length };
  }

  // Exact match failed — two-point proportional fallback
  const rLen = rawContent.length || 1;
  return {
    start: Math.round((rawStart / rLen) * renderedText.length),
    end:   Math.round((rawEnd   / rLen) * renderedText.length),
  };
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

        if (highlight.text) {
          const renderedText = contentRef.current.textContent || "";
          const pos = rawToRenderedOffsets(
            content, renderedText, highlight.start, highlight.end, highlight.text,
          );
          displayStart = pos.start;
          displayEnd = pos.end;
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
        const renderedStart = getTextOffset(contentEl, sel.anchorNode, sel.anchorOffset);
        const renderedEnd   = getTextOffset(contentEl, sel.focusNode, sel.focusOffset);
        const rStart = Math.min(renderedStart, renderedEnd);
        const rEnd   = Math.max(renderedStart, renderedEnd);
        const renderedText = contentEl.textContent || "";

        const raw = renderedToRawOffsets(content, renderedText, rStart, rEnd, text);
        setSelectionRange({ text, start: raw.start, end: raw.end });
      } catch {
        // Last resort: search in raw content directly
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
