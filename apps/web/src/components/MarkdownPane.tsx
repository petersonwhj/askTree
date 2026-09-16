import { useRef, useState, useEffect, useCallback } from "react";
import { renderMarkdown } from "../lib/markdown";
import { scrollFraction, scrollTopForFraction, scrollTopForMark } from "../lib/scroll";
import { FloatingAskButton } from "./FloatingAskButton";

interface Props {
  content: string;
  highlights?: Array<{ startPos: number; endPos: number; nodeId: string }>;
  highlight?: { start: number; end: number; text?: string } | null;
  onTextSelected: (text: string, startPos: number, endPos: number) => void;
  /** Normalized scroll fraction to restore when this pane opens. */
  initialScrollFraction?: number;
  /** Called (debounced) with the new normalized scroll fraction. */
  onScrollFractionChange?: (fraction: number) => void;
  /** Passages already asked about (surviving child edges), shown as subtle marks. */
  explored?: Array<{ start: number; end: number; text?: string }>;
  /** Scroll to the active highlight (the question's quoted passage) on open. */
  scrollToHighlight?: boolean;
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

/**
 * Offset of (target, targetOffset) within the *visible* text of `root`.
 * Endpoints inside hidden KaTeX MathML map to the start/end of that formula's
 * visible glyphs, so a formula can still be selected.
 */
function visibleOffset(
  root: Node,
  target: Node,
  targetOffset: number,
  mathmlEdge: "start" | "end",
): number {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let offset = 0;
  while (walker.nextNode()) {
    const node = walker.currentNode;
    if (node === target) {
      if (isInsideKatexMathml(node)) {
        const el =
          node.nodeType === Node.ELEMENT_NODE ? (node as Element) : node.parentElement;
        const katex = el?.closest?.(".katex") ?? null;
        const visibleLen = katex ? getVisibleText(katex).length : 0;
        return mathmlEdge === "start" ? offset : offset + visibleLen;
      }
      return offset + targetOffset;
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
    // Reconstruct supported inline Markdown so the result can be found verbatim
    // in the raw source (enables exact raw-offset mapping, not a proportional estimate).
    switch (el.tagName) {
      case "STRONG":
      case "B":
        return result ? `**${result}**` : "";
      case "EM":
      case "I":
        return result ? `*${result}*` : "";
      case "DEL":
      case "S":
        return result ? `~~${result}~~` : "";
      case "CODE":
        // Inline code only; fenced/indented blocks fall back to the visible-text candidate.
        return !el.closest("pre") && result ? `\`${result}\`` : result;
      default:
        return result;
    }
  }

  return "";
}

/** Reconstruct the markdown source (with LaTeX and inline syntax) covered by `range`. */
function extractSelectionSource(contentEl: HTMLElement, range: Range): string {
  return serializeInRange(contentEl, range).trim();
}

// ---------------------------------------------------------------------------
// Highlight — walks the SAME visible-text space (skips .katex-mathml)
// ---------------------------------------------------------------------------

function applyHighlight(
  root: HTMLElement,
  start: number,
  end: number,
  className = "asktree-highlight",
) {
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
      mark.className = className;
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

/**
 * Whitespace-insensitive occurrence search. KaTeX/Markdown normalise spacing
 * (e.g. raw `$$\n\\frac{a}{b}\n$$` vs reconstructed `$$\\frac{a}{b}$$`), so an
 * exact search can fail. This finds the raw span whose non-space characters
 * match the needle, keeping the real raw indices.
 */
function findOccurrenceNormalized(
  haystack: string,
  needle: string,
  refLen: number,
  refPos: number,
): { start: number; end: number } | null {
  const n = needle.replace(/\s+/g, "");
  if (!n) return null;

  let stripped = "";
  const map: number[] = [];
  for (let i = 0; i < haystack.length; i++) {
    if (/\s/.test(haystack[i])) continue;
    stripped += haystack[i];
    map.push(i);
  }

  const approx = refLen > 0 ? Math.round((refPos / refLen) * stripped.length) : 0;
  let bestIdx = -1;
  let bestDist = Infinity;
  let from = 0;
  while (true) {
    const idx = stripped.indexOf(n, from);
    if (idx === -1) break;
    const dist = Math.abs(idx - approx);
    if (dist < bestDist) {
      bestDist = dist;
      bestIdx = idx;
    }
    from = idx + 1;
  }
  if (bestIdx < 0) return null;
  return { start: map[bestIdx], end: map[bestIdx + n.length - 1] + 1 };
}

/** Map visible-rendered offsets → raw-markdown offsets via reconstructed source text. */
function renderedToRawOffsets(
  rawContent: string,
  renderedText: string,
  renderedStart: number,
  renderedEnd: number,
  sourceTexts: string[],
): { start: number; end: number } {
  // 1. Exact raw substring (reconstructed Markdown/LaTeX); richest candidate first.
  for (const sourceText of sourceTexts) {
    if (!sourceText) continue;
    const rawIdx = findClosestOccurrence(rawContent, sourceText, renderedText.length, renderedStart);
    if (rawIdx >= 0) {
      return { start: rawIdx, end: rawIdx + sourceText.length };
    }
  }
  // 2. Whitespace-insensitive match (handles math with different spacing).
  for (const sourceText of sourceTexts) {
    if (!sourceText) continue;
    const pos = findOccurrenceNormalized(rawContent, sourceText, renderedText.length, renderedStart);
    if (pos) return pos;
  }
  // 3. Last resort: proportional estimate.
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

export function MarkdownPane({
  content,
  onTextSelected,
  highlight,
  initialScrollFraction,
  onScrollFractionChange,
  explored,
  scrollToHighlight,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const restoringRef = useRef(false);
  const scrollSaveTimer = useRef<number | null>(null);
  const [floatingPos, setFloatingPos] = useState<{ text: string; top: number; left: number } | null>(null);
  const [selectionRange, setSelectionRange] = useState<{ text: string; start: number; end: number } | null>(null);

  useEffect(() => {
    if (contentRef.current) {
      const root = contentRef.current;
      root.innerHTML = renderMarkdown(content);
      // renderedText excludes hidden MathML, so offsets stay consistent.
      const renderedText = getVisibleText(root);

      // Active selection first — it takes precedence over explored marks.
      let activeRange: { start: number; end: number } | null = null;
      if (highlight && highlight.start >= 0 && highlight.end > highlight.start) {
        let displayStart = highlight.start;
        let displayEnd = highlight.end;

        if (highlight.text) {
          const pos = rawToRenderedOffsets(
            content, renderedText, highlight.start, highlight.end, highlight.text,
          );
          displayStart = pos.start;
          displayEnd = pos.end;
        }

        if (displayStart >= 0 && displayEnd > displayStart) {
          applyHighlight(root, displayStart, displayEnd);
          activeRange = { start: displayStart, end: displayEnd };
        }
      }

      if (explored) {
        for (const span of explored) {
          if (span.start < 0 || span.end <= span.start) continue;
          const pos = span.text
            ? rawToRenderedOffsets(content, renderedText, span.start, span.end, span.text)
            : { start: span.start, end: span.end };
          if (pos.end <= pos.start) continue;
          // Skip anything the active selection already covers.
          if (activeRange && pos.start < activeRange.end && pos.end > activeRange.start) continue;
          applyHighlight(root, pos.start, pos.end, "asktree-explored");
        }
      }
    }

    const el = containerRef.current;
    let positioned = false;

    // Position at the question's quoted passage when asked (wins over the
    // saved reading position).
    if (el && scrollToHighlight) {
      const mark = el.querySelector(".asktree-highlight") as HTMLElement | null;
      if (mark) {
        positioned = true;
        restoringRef.current = true;
        const scrollToMark = () => {
          el.scrollTop = scrollTopForMark(mark.offsetTop, el.clientHeight);
        };
        scrollToMark();
        requestAnimationFrame(() => {
          scrollToMark();
          restoringRef.current = false;
        });
      }
    }

    // Otherwise restore the learner's reading position. Guard against the
    // scroll event fired by this programmatic move overwriting the saved value.
    if (!positioned && el && initialScrollFraction != null) {
      restoringRef.current = true;
      const restore = () => {
        el.scrollTop = scrollTopForFraction(initialScrollFraction, el.scrollHeight, el.clientHeight);
      };
      restore();
      requestAnimationFrame(() => {
        restore();
        restoringRef.current = false;
      });
    }
  }, [content, highlight, initialScrollFraction, explored, scrollToHighlight]);

  const handleScroll = useCallback(() => {
    if (restoringRef.current || !onScrollFractionChange) return;
    const el = containerRef.current;
    if (!el) return;
    if (scrollSaveTimer.current !== null) window.clearTimeout(scrollSaveTimer.current);
    scrollSaveTimer.current = window.setTimeout(() => {
      onScrollFractionChange(scrollFraction(el.scrollTop, el.scrollHeight, el.clientHeight));
    }, 250);
  }, [onScrollFractionChange]);

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
    const a = visibleOffset(contentEl, sel.anchorNode, sel.anchorOffset, "start");
    const b = visibleOffset(contentEl, sel.focusNode, sel.focusOffset, "end");
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

    // Reconstruct the raw source (LaTeX + supported inline Markdown) and try it
    // first for an exact match. Fall back to the visible text (covers partial
    // inline selections), then to a proportional estimate. Exact matches keep
    // the badge/prompt offsets aligned with the article highlight.
    const sourceText = extractSelectionSource(contentEl, range);
    const candidates =
      sourceText && sourceText !== domVisible ? [sourceText, domVisible] : [domVisible];

    const rect = range.getBoundingClientRect();
    setFloatingPos({
      text: domVisible.slice(0, 50),
      top: rect.bottom + 4,
      left: rect.left + rect.width / 2 - 60,
    });

    const raw = renderedToRawOffsets(content, visibleText, rStart, rEnd, candidates);
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
    <div className="markdown-pane" ref={containerRef} onScroll={handleScroll}>
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
