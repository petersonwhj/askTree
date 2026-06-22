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
// KaTeX renders each formula as TWO sibling subtrees inside <span class="katex">:
//   <span class="katex-mathml"><annotation>…LaTeX…</annotation></span>  (hidden)
//   <span class="katex-html" aria-hidden>…visible glyphs…</span>
// textContent and Selection.toString() scrape BOTH → duplicated garble.
//
// We therefore define ONE consistent "visible text" space that excludes the
// hidden .katex-mathml subtree, and use it for: offset measurement, the stored
// selection string, and highlight application. This keeps the rendered side
// internally consistent. (Raw-markdown offsets are computed separately so the
// badge/prompt can recover the original LaTeX.)
// ---------------------------------------------------------------------------

function isInsideKatexMathml(node: Node): boolean {
  let el: Element | null =
    node.nodeType === Node.ELEMENT_NODE ? (node as Element) : node.parentElement;
  while (el) {
    if (el.classList && el.classList.contains("katex-mathml")) return true;
    el = el.parentElement;
  }
  return false;
}

/** Concatenated text of `root`, excluding hidden .katex-mathml subtrees. */
function getVisibleText(root: Node): string {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let out = "";
  while (walker.nextNode()) {
    const node = walker.currentNode;
    if (isInsideKatexMathml(node)) continue;
    out += node.textContent || "";
  }
  return out;
}

/** Offset of (target, targetOffset) within the *visible* text of `root`. */
function visibleOffset(root: Node, target: Node, targetOffset: number): number {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let offset = 0;
  while (walker.nextNode()) {
    const node = walker.currentNode;
    if (node === target) {
      return isInsideKatexMathml(node) ? offset : offset + targetOffset;
    }
    if (isInsideKatexMathml(node)) continue;
    offset += node.textContent?.length || 0;
  }
  return offset;
}

// ---------------------------------------------------------------------------
// LaTeX source reconstruction for KaTeX selections (raw-offset matching only)
// ---------------------------------------------------------------------------

function serializeInRange(node: Node, range: Range): string {
  if (!range.intersectsNode(node)) return "";

  if (node.nodeType === Node.TEXT_NODE) {
    if (isInsideKatexMathml(node)) return ""; // handled by .katex below
    const text = node.textContent || "";
    const startOffset = node === range.startContainer ? range.startOffset : 0;
    const endOffset   = node === range.endContainer   ? range.endOffset   : text.length;
    if (node !== range.startContainer && node !== range.endContainer) {
      try {
        const cmpStart = range.comparePoint(node, 0);
        const cmpEnd   = range.comparePoint(node, text.length);
        if (cmpStart === -1 || cmpEnd === 1) return "";
      } catch {
        // comparePoint unsupported — include node
      }
    }
    return text.slice(startOffset, endOffset);
  }

  if (node.nodeType === Node.ELEMENT_NODE) {
    const el = node as Element;
    if (el.classList.contains("katex")) {
      const annotation = el.querySelector('annotation[encoding="application/x-tex"]');
      if (annotation) {
        const tex = (annotation.textContent || "").trim();
        if (!tex) return "";
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

/** Reconstruct the markdown source (with LaTeX) covered by `range`. */
function extractSelectionSource(contentEl: HTMLElement, range: Range): string {
  return serializeInRange(contentEl, range).trim();
}

function selectionTouchesKatex(sel: Selection, contentEl: HTMLElement): boolean {
  const range = sel.getRangeAt(0);
  let ancestor: Node | null = range.commonAncestorContainer;
  while (ancestor && ancestor !== contentEl) {
    if (ancestor instanceof Element && ancestor.classList.contains("katex")) return true;
    ancestor = ancestor.parentNode;
  }
  const katexEls = contentEl.querySelectorAll(".katex");
  for (const el of katexEls) {
    if (range.intersectsNode(el)) return true;
  }
  return false;
}

// ---------------------------------------------------------------------------
// Highlight — walks the SAME visible-text space (skips .katex-mathml)
// ---------------------------------------------------------------------------

function applyHighlight(root: HTMLElement, start: number, end: number) {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let offset = 0;
  const targets: Array<{ node: Text; s: number; e: number }> = [];
  while (walker.nextNode()) {
    const node = walker.currentNode as Text;
    if (isInsideKatexMathml(node)) continue; // consistent with visible-text space
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
// Coordinate mapping (rendered visible-text ↔ raw markdown)
// ---------------------------------------------------------------------------

function findClosestOccurrence(
  haystack: string,
  needle: string,
  refLen: number,
  refPos: number,
): number {
  if (!needle) return -1;
  const approx = refLen > 0 ? Math.round((refPos / refLen) * haystack.length) : 0;
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

/** Map visible-rendered offsets → raw-markdown offsets via the LaTeX/text source. */
function renderedToRawOffsets(
  rawContent: string,
  renderedText: string,
  renderedStart: number,
  renderedEnd: number,
  sourceText: string,
): { start: number; end: number } {
  const rawIdx = findClosestOccurrence(rawContent, sourceText, renderedText.length, renderedStart);
  if (rawIdx >= 0) {
    return { start: rawIdx, end: rawIdx + sourceText.length };
  }
  const rLen = renderedText.length || 1;
  return {
    start: Math.round((renderedStart / rLen) * rawContent.length),
    end:   Math.round((renderedEnd   / rLen) * rawContent.length),
  };
}

/** Map raw-markdown offsets → visible-rendered offsets via the stored visible text. */
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
          // Map stored raw offsets → visible-rendered offsets using stored
          // visible text. renderedText excludes hidden MathML for consistency.
          const renderedText = getVisibleText(contentRef.current);
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

    // Visible-text space: consistent for storage + highlight (skips MathML)
    const visibleText = getVisibleText(contentEl);
    const a = visibleOffset(contentEl, sel.anchorNode, sel.anchorOffset);
    const b = visibleOffset(contentEl, sel.focusNode, sel.focusOffset);
    const rStart = Math.min(a, b);
    const rEnd = Math.max(a, b);

    // domVisible is GUARANTEED to be a substring of visibleText (it's a slice),
    // so highlight re-matching can never drift.
    const domVisible = visibleText.slice(rStart, rEnd).trim();
    if (!domVisible || domVisible.length > 500) {
      setFloatingPos(null);
      setSelectionRange(null);
      return;
    }

    // For raw-offset mapping we need a string that exists in the RAW markdown.
    // KaTeX selection → reconstruct LaTeX; plain prose → the visible text.
    const touchesKatex = selectionTouchesKatex(sel, contentEl);
    const sourceText = touchesKatex ? extractSelectionSource(contentEl, range) : domVisible;

    const rect = range.getBoundingClientRect();
    setFloatingPos({
      text: domVisible.slice(0, 50),
      top: rect.bottom + 4,
      left: rect.left + rect.width / 2 - 60,
    });

    const raw = renderedToRawOffsets(content, visibleText, rStart, rEnd, sourceText || domVisible);
    // Store domVisible for the highlight path; offsets index the raw markdown.
    setSelectionRange({ text: domVisible, start: raw.start, end: raw.end });
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
