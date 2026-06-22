import { useRef, useState, useEffect, useCallback } from "react";
import { renderMarkdown } from "../lib/markdown";
import { FloatingAskButton } from "./FloatingAskButton";

interface Props {
  content: string;
  highlights?: Array<{ startPos: number; endPos: number; nodeId: string }>;
  highlight?: { start: number; end: number; text?: string } | null;
  onTextSelected: (text: string, startPos: number, endPos: number) => void;
}

// ---------------------------------------------------------------------------
// Selection source reconstruction  (CONTRIBUTION-NOTES.md Appendix 3)
//
// Selection.toString() returns garbled text for KaTeX formulas because it
// scrapes BOTH the hidden MathML subtree AND the visible HTML glyphs.
// Instead, walk the LIVE content DOM with the Range and, when we hit a
// .katex wrapper, extract the original LaTeX from its
//   <annotation encoding="application/x-tex">…</annotation>
// and stop descending — this avoids the duplication entirely.
// ---------------------------------------------------------------------------

function serializeInRange(node: Node, range: Range): string {
  if (!range.intersectsNode(node)) return "";

  if (node.nodeType === Node.TEXT_NODE) {
    const text = node.textContent || "";
    const start = node === range.startContainer ? range.startOffset : 0;
    const end   = node === range.endContainer   ? range.endOffset   : text.length;
    return text.slice(start, end);
  }

  if (node.nodeType === Node.ELEMENT_NODE) {
    const el = node as Element;

    // KaTeX wrapper — emit annotation LaTeX ONCE, don't descend
    if (el.classList.contains("katex")) {
      const annotation = el.querySelector('annotation[encoding="application/x-tex"]');
      if (annotation) {
        const tex = (annotation.textContent || "").trim();
        if (!tex) return "";
        // No extra newlines — must match the raw markdown exactly
        return el.closest(".katex-display") ? `$$${tex}$$` : `$${tex}$`;
      }
      return "";
    }

    let result = "";
    for (let i = 0; i < node.childNodes.length; i++) {
      result += serializeInRange(node.childNodes[i], range);
    }
    return result;
  }

  return "";
}

/**
 * Reconstruct the markdown source covered by `range`.
 * Walk from range.commonAncestorContainer (not the whole contentEl root)
 * so we only touch nodes actually within the selection.
 * Only used when the selection intersects KaTeX.
 */
function extractSelectionSource(range: Range): string {
  const root = range.commonAncestorContainer;
  return serializeInRange(root, range).trim();
}

/** Check whether a Selection intersects any .katex element */
function selectionTouchesKatex(sel: Selection, contentEl: HTMLElement): boolean {
  const range = sel.getRangeAt(0);
  // Quick check: does the range's common ancestor contain .katex?
  let ancestor: Node | null = range.commonAncestorContainer;
  while (ancestor && ancestor !== contentEl) {
    if (ancestor instanceof Element && ancestor.classList.contains("katex")) return true;
    ancestor = ancestor.parentNode;
  }
  // Broader: walk .katex elements and check intersection
  const katexEls = contentEl.querySelectorAll(".katex");
  for (const el of katexEls) {
    if (range.intersectsNode(el)) return true;
  }
  return false;
}

// ---------------------------------------------------------------------------
// Highlight
// ---------------------------------------------------------------------------

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
      // Node boundary changed — skip
    }
  }
}

// ---------------------------------------------------------------------------
// Offset helpers (rendered DOM)
// ---------------------------------------------------------------------------

function getTextOffset(container: Node, targetNode: Node, targetOffset: number): number {
  const range = document.createRange();
  range.setStart(container, 0);
  range.setEnd(targetNode, targetOffset);
  return range.toString().length;
}

// ---------------------------------------------------------------------------
// Coordinate mapping
// ---------------------------------------------------------------------------

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
  const rLen = renderedText.length || 1;
  return {
    start: Math.round((renderedStart / rLen) * rawContent.length),
    end:   Math.round((renderedEnd   / rLen) * rawContent.length),
  };
}

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
  const rLen = rawContent.length || 1;
  return {
    start: Math.round((rawStart / rLen) * renderedText.length),
    end:   Math.round((rawEnd   / rLen) * renderedText.length),
  };
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

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
    const contentEl = contentRef.current;
    if (!contentEl || !sel.anchorNode || !sel.focusNode) {
      setFloatingPos(null);
      setSelectionRange(null);
      return;
    }

    // For KaTeX selections: reconstruct real LaTeX source  (Appendix 3)
    // For plain prose: use sel.toString() — fast, reliable, unchanged
    const touchesKatex = selectionTouchesKatex(sel, contentEl);
    const domText = sel.toString().trim();
    const sourceText = touchesKatex
      ? extractSelectionSource(range)
      : domText;
    if (!sourceText || sourceText.length > 500) {
      setFloatingPos(null);
      setSelectionRange(null);
      return;
    }

    const rect = range.getBoundingClientRect();

    setFloatingPos({
      text: domText.slice(0, 50),
      top: rect.bottom + 4,
      left: rect.left + rect.width / 2 - 60,
    });

    try {
      const renderedStart = getTextOffset(contentEl, sel.anchorNode, sel.anchorOffset);
      const renderedEnd   = getTextOffset(contentEl, sel.focusNode, sel.focusOffset);
      const rStart = Math.min(renderedStart, renderedEnd);
      const rEnd   = Math.max(renderedStart, renderedEnd);
      const renderedText = contentEl.textContent || "";

      // sourceText for KaTeX contains real LaTeX → findClosestOccurrence finds exact match
      // domText for prose is unchanged → works as before
      const raw = renderedToRawOffsets(content, renderedText, rStart, rEnd, sourceText);
      setSelectionRange({ text: sourceText, start: raw.start, end: raw.end });
    } catch {
      const s = content.indexOf(sourceText);
      setSelectionRange({ text: sourceText, start: s, end: s >= 0 ? s + sourceText.length : 0 });
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
