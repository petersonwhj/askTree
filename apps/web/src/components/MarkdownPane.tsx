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
 * Returns -1 when no exact match is found (e.g. math/formatting chars).
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
 * Strip markdown formatting characters that differ between raw source and
 * rendered DOM text (math delimiters, subscripts, bold/italic markers,
 * LaTeX commands, braces).  The returned `map` array gives the original
 * position for each normalized character — `map[i]` = offset in `original`.
 */
const RE_FORMATTING = /[$_*\\{}`]/g;
function normalizeForMatching(original: string): { text: string; map: number[] } {
  const chars: string[] = [];
  const map: number[] = [];
  for (let i = 0; i < original.length; i++) {
    if (!RE_FORMATTING.test(original[i])) {
      chars.push(original[i]);
      map.push(i);
    }
  }
  return { text: chars.join(""), map };
}

/**
 * Map a rendered-text offset to the corresponding raw-markdown offset.
 * When exact text matching fails (math/formatting chars differ between
 * raw and rendered), falls back to a normalized comparison that strips
 * `$`, `_`, `*`, `\\`, `{`, `}`, `` ` `` so the underlying words can still
 * be located, then maps the result back to raw positions.
 */
function renderedToRawOffset(
  rawContent: string,
  renderedText: string,
  renderedOffset: number,
  selectedText: string,
): { start: number; end: number; text: string } {
  // 1. Try exact match in raw content
  const rawIdx = findClosestOccurrence(rawContent, selectedText, renderedText.length, renderedOffset);
  if (rawIdx >= 0) {
    return { start: rawIdx, end: rawIdx + selectedText.length, text: selectedText };
  }

  // 2. Exact match failed — normalise both sides by stripping formatting
  const rawNorm = normalizeForMatching(rawContent);
  const selNorm = normalizeForMatching(selectedText);
  const renderedNorm = normalizeForMatching(renderedText);

  // Proportional position of the selection in rendered (normalised space)
  const renderedNormLen = renderedNorm.text.length || 1;
  const rendStartNorm = Math.round((renderedOffset / (renderedText.length || 1)) * renderedNormLen);

  const normIdx = findClosestOccurrence(rawNorm.text, selNorm.text, renderedNormLen, rendStartNorm);
  if (normIdx >= 0) {
    // Map normalised positions back to raw positions
    const rawStart = rawNorm.map[normIdx];
    const rawEnd = rawNorm.map[normIdx + selNorm.text.length - 1] + 1;
    const rawText = rawContent.slice(rawStart, rawEnd);
    return { start: rawStart, end: rawEnd, text: rawText };
  }

  // 3. Last resort — proportional estimate, snap to word boundaries
  const ratio = renderedText.length > 0 ? renderedOffset / renderedText.length : 0;
  let start = Math.round(rawContent.length * ratio);
  let end = start + selectedText.length;

  // Snap left to nearest space / newline
  while (start > 0 && rawContent[start - 1] !== " " && rawContent[start - 1] !== "\n") start--;
  // Snap right to nearest space / newline
  while (end < rawContent.length && rawContent[end] !== " " && rawContent[end] !== "\n") end++;

  const rawText = rawContent.slice(start, end);
  return { start, end, text: rawText };
}

/**
 * Map a raw-markdown offset to the corresponding rendered-text offset
 * (the reverse of renderedToRawOffset).  Uses the same normalised-matching
 * fallback so that highlights land correctly even when the stored text
 * contains markdown formatting characters.
 */
function rawToRenderedOffset(
  rawContent: string,
  renderedText: string,
  rawOffset: number,
  selectedText: string,
): number {
  // 1. Try exact match in rendered text
  const renderedIdx = findClosestOccurrence(renderedText, selectedText, rawContent.length, rawOffset);
  if (renderedIdx >= 0) {
    return renderedIdx;
  }

  // 2. Exact match failed — normalise both sides
  const rawNorm = normalizeForMatching(rawContent);
  const selNorm = normalizeForMatching(selectedText);
  const renderedNorm = normalizeForMatching(renderedText);

  // Proportional position of the raw offset in normalised raw space
  const rawNormLen = rawNorm.text.length || 1;
  const rawStartNorm = Math.round((rawOffset / (rawContent.length || 1)) * rawNormLen);

  const normIdx = findClosestOccurrence(renderedNorm.text, selNorm.text, rawNormLen, rawStartNorm);
  if (normIdx >= 0) {
    // Map normalised position back to rendered position
    return renderedNorm.map[normIdx];
  }

  // 3. Last resort — proportional estimate
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

        // Map rendered offset → raw markdown offset using text search.
        // Use the raw text returned by renderedToRawOffset so the stored
        // selectedText always matches the raw markdown (important when
        // the selection spans math or other formatted content).
        const raw = renderedToRawOffset(content, renderedText, renderedPos, text);
        setSelectionRange({ text: raw.text, start: raw.start, end: raw.end });
      } catch {
        // Fallback: search in raw content directly
        const s = content.indexOf(text);
        const rawText = s >= 0 ? text : content.slice(s, s + text.length);
        setSelectionRange({ text: rawText, start: Math.max(0, s), end: s >= 0 ? s + text.length : 0 });
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
