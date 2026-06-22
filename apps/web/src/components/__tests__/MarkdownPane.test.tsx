import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, fireEvent, act } from "@testing-library/react";
import { MarkdownPane } from "../MarkdownPane";

describe("MarkdownPane", () => {
  beforeEach(() => {
    Element.prototype.getBoundingClientRect = vi.fn(() => ({
      x: 0, y: 0, width: 800, height: 600,
      top: 0, left: 0, right: 800, bottom: 600,
      toJSON: () => {},
    }));
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("should render markdown content as HTML", () => {
    const { container } = render(<MarkdownPane content="# Hello World" onTextSelected={() => {}} />);
    expect(container.querySelector("h1")).toBeTruthy();
    expect(container.querySelector("h1")?.textContent).toBe("Hello World");
  });

  it("should render paragraphs", () => {
    const { container } = render(<MarkdownPane content="This is a paragraph." onTextSelected={() => {}} />);
    expect(container.querySelector("p")).toBeTruthy();
  });

  it("should call onTextSelected with source text for plain-text selection", async () => {
    const onTextSelected = vi.fn();

    const { container } = render(
      <MarkdownPane content="Hello World" onTextSelected={onTextSelected} />
    );

    await act(async () => {
      await new Promise((r) => setTimeout(r, 10));
    });

    const contentDiv = container.querySelector(".markdown-pane > div")!;
    const p = contentDiv.querySelector("p")!;
    const textNode = p.firstChild!;

    const mockRange = {
      getBoundingClientRect: () => ({ x: 10, y: 20, width: 50, height: 16, top: 20, left: 10, right: 60, bottom: 36 }),
      toString: () => "Hello",
      cloneRange: () => mockRange,
      startContainer: textNode,
      startOffset: 0,
      endContainer: textNode,
      endOffset: 5,
      collapsed: false,
      commonAncestorContainer: p,
      intersectsNode: (node: Node) => node === textNode || node === p || node === contentDiv,
      setStart: () => {},
      setEnd: () => {},
    } as unknown as Range;

    const mockSelection = {
      isCollapsed: false,
      toString: () => "Hello",
      anchorNode: textNode,
      anchorOffset: 0,
      focusNode: textNode,
      focusOffset: 5,
      getRangeAt: () => mockRange,
      removeAllRanges: vi.fn(),
      containsNode: () => true,
    };

    vi.spyOn(window, "getSelection").mockReturnValue(mockSelection as unknown as Selection);

    fireEvent.mouseUp(document);

    await act(async () => {
      await new Promise((r) => setTimeout(r, 10));
    });

    const floatingBtn = container.querySelector(".floating-ask");
    expect(floatingBtn).toBeTruthy();

    fireEvent.mouseDown(floatingBtn!);

    expect(onTextSelected).toHaveBeenCalledTimes(1);
    // sourceText should be "Hello" (same as raw content)
    expect(onTextSelected).toHaveBeenCalledWith("Hello", expect.any(Number), expect.any(Number));
  });

  it("should extract LaTeX from KaTeX annotation and skip MathML duplication", async () => {
    // Render with raw markdown content
    const onTextSelected = vi.fn();
    const rawContent = "The formula $a \\cdot a^{-1} = e$ is fundamental.";

    const { container } = render(
      <MarkdownPane content={rawContent} onTextSelected={onTextSelected} />
    );

    await act(async () => {
      await new Promise((r) => setTimeout(r, 10));
    });

    // Replace the rendered content with our custom KaTeX-like DOM
    const contentDiv = container.querySelector(".markdown-pane > div")!;
    contentDiv.innerHTML = "";

    const beforeText = document.createTextNode("The formula ");
    contentDiv.appendChild(beforeText);

    const katexSpan = document.createElement("span");
    katexSpan.className = "katex";
    const mathmlSpan = document.createElement("span");
    mathmlSpan.className = "katex-mathml";
    const annotation = document.createElement("annotation");
    annotation.setAttribute("encoding", "application/x-tex");
    annotation.textContent = "a \\cdot a^{-1} = e";
    mathmlSpan.appendChild(annotation);
    katexSpan.appendChild(mathmlSpan);
    const htmlSpan = document.createElement("span");
    htmlSpan.className = "katex-html";
    htmlSpan.setAttribute("aria-hidden", "true");
    htmlSpan.textContent = "a ⋅ a⁻¹ = e";
    katexSpan.appendChild(htmlSpan);
    contentDiv.appendChild(katexSpan);

    const afterText = document.createTextNode(" is fundamental.");
    contentDiv.appendChild(afterText);

    // Build the ancestors-of predicate for intersectsNode
    const ancestorsOf = (node: Node): Set<Node> => {
      const set = new Set<Node>();
      let cur: Node | null = node;
      while (cur) { set.add(cur); cur = cur.parentNode; }
      return set;
    };
    const startAncestors = ancestorsOf(beforeText);
    const endAncestors = ancestorsOf(afterText);

    const mockRange = {
      getBoundingClientRect: () => ({ x: 10, y: 20, width: 200, height: 16, top: 20, left: 10, right: 210, bottom: 36 }),
      toString: () => "a ⋅ a⁻¹ = e",
      cloneRange: () => mockRange,
      startContainer: beforeText,
      startOffset: beforeText.textContent!.length,
      endContainer: afterText,
      endOffset: 0,
      collapsed: false,
      commonAncestorContainer: contentDiv,
      intersectsNode: (node: Node) => startAncestors.has(node) || endAncestors.has(node) || node === katexSpan || node === mathmlSpan || node === annotation,
      setStart: () => {},
      setEnd: () => {},
    } as unknown as Range;

    const mockSelection = {
      isCollapsed: false,
      toString: () => "a ⋅ a⁻¹ = e",
      anchorNode: beforeText,
      anchorOffset: beforeText.textContent!.length,
      focusNode: afterText,
      focusOffset: 0,
      getRangeAt: () => mockRange,
      removeAllRanges: vi.fn(),
      containsNode: () => true,
    };

    vi.spyOn(window, "getSelection").mockReturnValue(mockSelection as unknown as Selection);

    fireEvent.mouseUp(document);

    await act(async () => {
      await new Promise((r) => setTimeout(r, 10));
    });

    const floatingBtn = container.querySelector(".floating-ask");
    expect(floatingBtn).toBeTruthy();

    fireEvent.mouseDown(floatingBtn!);

    expect(onTextSelected).toHaveBeenCalledTimes(1);
    const [sourceText] = onTextSelected.mock.calls[0];
    expect(sourceText).toBe("$a \\cdot a^{-1} = e$");
    expect(sourceText).not.toContain("⋅"); // no visual glyph
  });
});
