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

  it("should use LaTeX source for offset mapping and avoid doubled text for KaTeX selections", async () => {
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
    const [storedText, start, end] = onTextSelected.mock.calls[0];
    // storedText is domText (for highlight path).
    // Raw LaTeX is computed in DualPanel from parentContent.slice(start, end).
    // The key guarantee: NOT the doubled garble like "a ⋅ a⁻¹ = ea ⋅ a⁻¹ = e"
    expect(storedText).not.toMatch(/(.{5,})\1/); // no significant substring repeated immediately
    // Offsets must be valid
    expect(end).toBeGreaterThan(start);
    expect(start).toBeGreaterThanOrEqual(0);
  });

  function textNodesOf(root: Node): Text[] {
    const out: Text[] = [];
    const w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    while (w.nextNode()) out.push(w.currentNode as Text);
    return out;
  }

  async function selectRange(range: Range) {
    const r = range as unknown as { getBoundingClientRect?: () => DOMRect };
    r.getBoundingClientRect = () =>
      ({ x: 10, y: 20, width: 50, height: 16, top: 20, left: 10, right: 60, bottom: 36, toJSON: () => ({}) }) as DOMRect;

    vi.spyOn(window, "getSelection").mockReturnValue({
      isCollapsed: false,
      toString: () => range.toString(),
      anchorNode: range.startContainer,
      anchorOffset: range.startOffset,
      focusNode: range.endContainer,
      focusOffset: range.endOffset,
      getRangeAt: () => range,
      removeAllRanges: vi.fn(),
      containsNode: () => true,
    } as unknown as Selection);
    fireEvent.mouseUp(document);
    await act(async () => {
      await new Promise((r) => setTimeout(r, 10));
    });
  }

  it("maps a selection spanning inline math to the exact raw slice", async () => {
    const raw = "See $\\alpha$ here.";
    const onTextSelected = vi.fn();
    const { container } = render(<MarkdownPane content={raw} onTextSelected={onTextSelected} />);
    await act(async () => {
      await new Promise((r) => setTimeout(r, 10));
    });

    const contentDiv = container.querySelector(".markdown-pane > div")!;
    const nodes = textNodesOf(contentDiv);
    const seeNode = nodes.find((n) => n.textContent!.startsWith("See"))!;
    const hereNode = nodes.find((n) => n.textContent!.includes("here"))!;
    const range = document.createRange();
    range.setStart(seeNode, seeNode.textContent!.length); // after "See "
    range.setEnd(hereNode, hereNode.textContent!.length);
    await selectRange(range);

    fireEvent.mouseDown(container.querySelector(".floating-ask")!);
    const [text, start, end] = onTextSelected.mock.calls[0];
    expect(text).toContain("α");
    expect(raw.slice(start, end)).toBe("$\\alpha$ here.");
  });

  it("maps a selection through display math to the exact raw slice", async () => {
    const raw = "Before\n\n$$\n\\frac{a}{b}\n$$\n\nAfter";
    const onTextSelected = vi.fn();
    const { container } = render(<MarkdownPane content={raw} onTextSelected={onTextSelected} />);
    await act(async () => {
      await new Promise((r) => setTimeout(r, 10));
    });

    const contentDiv = container.querySelector(".markdown-pane > div")!;
    const before = contentDiv.querySelector("p")!;
    const after = contentDiv.querySelectorAll("p")[contentDiv.querySelectorAll("p").length - 1]!;
    const range = document.createRange();
    range.setStart(before.firstChild!, before.firstChild!.textContent!.length);
    range.setEnd(after.firstChild!, after.firstChild!.textContent!.length);
    await selectRange(range);

    fireEvent.mouseDown(container.querySelector(".floating-ask")!);
    const [, start, end] = onTextSelected.mock.calls[0];
    const slice = raw.slice(start, end);
    expect(slice).toContain("\\frac{a}{b}");
    expect(slice).toContain("After");
  });

  it("maps repeated text to the selected occurrence, not the first", async () => {
    const raw = "你好，你好，你好。";
    const onTextSelected = vi.fn();
    const { container } = render(<MarkdownPane content={raw} onTextSelected={onTextSelected} />);
    await act(async () => {
      await new Promise((r) => setTimeout(r, 10));
    });

    const contentDiv = container.querySelector(".markdown-pane > div")!;
    const node = textNodesOf(contentDiv)[0];
    const range = document.createRange();
    range.setStart(node, 3); // second "你好"
    range.setEnd(node, 5);
    await selectRange(range);

    fireEvent.mouseDown(container.querySelector(".floating-ask")!);
    const [, start, end] = onTextSelected.mock.calls[0];
    expect(raw.slice(start, end)).toBe("你好");
    expect(start).toBe(3);
  });

  it("selects a formula whose endpoints are inside the hidden MathML", async () => {
    const raw = "See $\\alpha$ here.";
    const onTextSelected = vi.fn();
    const { container } = render(<MarkdownPane content={raw} onTextSelected={onTextSelected} />);
    await act(async () => {
      await new Promise((r) => setTimeout(r, 10));
    });

    const contentDiv = container.querySelector(".markdown-pane > div")!;
    const mathml = contentDiv.querySelector(".katex-mathml")!;
    const nodes = textNodesOf(mathml);
    const range = document.createRange();
    range.setStart(nodes[0], 0);
    range.setEnd(nodes[nodes.length - 1], nodes[nodes.length - 1].textContent!.length);
    await selectRange(range);

    const btn = container.querySelector(".floating-ask");
    expect(btn).toBeTruthy();
    fireEvent.mouseDown(btn!);
    const [, start, end] = onTextSelected.mock.calls[0];
    expect(raw.slice(start, end)).toBe("$\\alpha$");
  });

  it("selects a formula when the selection endpoints are elements", async () => {
    const raw = "See $\\alpha$ here.";
    const onTextSelected = vi.fn();
    const { container } = render(<MarkdownPane content={raw} onTextSelected={onTextSelected} />);
    await act(async () => {
      await new Promise((r) => setTimeout(r, 10));
    });

    const contentDiv = container.querySelector(".markdown-pane > div")!;
    const katex = contentDiv.querySelector(".katex")!;
    const range = document.createRange();
    range.setStart(katex, 0);
    range.setEnd(katex, katex.childNodes.length);
    await selectRange(range);

    const btn = container.querySelector(".floating-ask");
    expect(btn).toBeTruthy();
    fireEvent.mouseDown(btn!);
    const [, start, end] = onTextSelected.mock.calls[0];
    expect(raw.slice(start, end)).toBe("$\\alpha$");
  });

  it("renders explored passages as subtle marks", async () => {
    const { container } = render(
      <MarkdownPane
        content="alpha beta gamma"
        onTextSelected={() => {}}
        explored={[{ start: 6, end: 10, text: "beta" }]}
      />,
    );

    await act(async () => {
      await new Promise((r) => setTimeout(r, 10));
    });

    const marks = container.querySelectorAll(".asktree-explored");
    expect(marks).toHaveLength(1);
    expect(marks[0].textContent).toBe("beta");
  });

  it("scrolls to the quoted passage when scrollToHighlight is set", async () => {
    const topSpy = vi.spyOn(HTMLElement.prototype, "offsetTop", "get").mockReturnValue(900);
    const heightSpy = vi.spyOn(Element.prototype, "clientHeight", "get").mockReturnValue(400);
    try {
      const { container } = render(
        <MarkdownPane
          content="alpha beta gamma"
          onTextSelected={() => {}}
          highlight={{ start: 6, end: 10, text: "beta" }}
          scrollToHighlight
        />,
      );

      await act(async () => {
        await new Promise((r) => setTimeout(r, 10));
      });

      const pane = container.querySelector(".markdown-pane") as HTMLElement;
      expect(pane.scrollTop).toBe(700);
    } finally {
      topSpy.mockRestore();
      heightSpy.mockRestore();
    }
  });

  it("gives the active selection precedence over explored marks", async () => {
    const { container } = render(
      <MarkdownPane
        content="alpha beta gamma"
        onTextSelected={() => {}}
        highlight={{ start: 6, end: 10, text: "beta" }}
        explored={[{ start: 6, end: 10, text: "beta" }]}
      />,
    );

    await act(async () => {
      await new Promise((r) => setTimeout(r, 10));
    });

    expect(container.querySelectorAll(".asktree-highlight")).toHaveLength(1);
    expect(container.querySelectorAll(".asktree-explored")).toHaveLength(0);
  });

  it("maps a selection spanning inline emphasis to exact raw markdown offsets", async () => {
    const onTextSelected = vi.fn();
    const rawContent =
      "前缀**重点**结尾。配置和分词器很小，但**必须一起下**，否则权重加载不了。";

    const { container } = render(
      <MarkdownPane content={rawContent} onTextSelected={onTextSelected} />
    );

    await act(async () => {
      await new Promise((r) => setTimeout(r, 10));
    });

    const contentDiv = container.querySelector(".markdown-pane > div")!;

    const allText: Text[] = [];
    const walker = document.createTreeWalker(contentDiv, NodeFilter.SHOW_TEXT);
    while (walker.nextNode()) allText.push(walker.currentNode as Text);

    const startNode = allText.find((n) => n.textContent!.includes("配置和分词器"))!;
    const endNode = allText[allText.length - 1];
    const startOffset = startNode.textContent!.indexOf("配置和分词器");
    const endOffset = endNode.textContent!.length;

    const nodeStart = (n: Node): number => {
      let o = 0;
      for (const t of allText) {
        if (t === n) return o;
        o += t.textContent!.length;
      }
      return o;
    };
    const globalStart = nodeStart(startNode) + startOffset;
    const globalEnd = nodeStart(endNode) + endOffset;

    const mockRange = {
      getBoundingClientRect: () => ({ x: 10, y: 20, width: 200, height: 16, top: 20, left: 10, right: 210, bottom: 36 }),
      toString: () => "配置和分词器很小，但必须一起下，否则权重加载不了。",
      cloneRange: () => mockRange,
      startContainer: startNode,
      startOffset,
      endContainer: endNode,
      endOffset,
      collapsed: false,
      commonAncestorContainer: contentDiv,
      intersectsNode: (node: Node) => contentDiv.contains(node) || node === contentDiv,
      comparePoint: (node: Node, offset: number) => {
        const g = nodeStart(node) + offset;
        return g < globalStart ? -1 : g > globalEnd ? 1 : 0;
      },
      setStart: () => {},
      setEnd: () => {},
    } as unknown as Range;

    const mockSelection = {
      isCollapsed: false,
      toString: () => "配置和分词器很小，但必须一起下，否则权重加载不了。",
      anchorNode: startNode,
      anchorOffset: startOffset,
      focusNode: endNode,
      focusOffset: endOffset,
      getRangeAt: () => mockRange,
      removeAllRanges: vi.fn(),
      containsNode: () => true,
    };
    vi.spyOn(window, "getSelection").mockReturnValue(mockSelection as unknown as Selection);

    fireEvent.mouseUp(document);
    await act(async () => {
      await new Promise((r) => setTimeout(r, 10));
    });

    const floating = container.querySelector(".floating-ask");
    expect(floating).toBeTruthy();
    fireEvent.mouseDown(floating!);

    expect(onTextSelected).toHaveBeenCalledTimes(1);
    const [, start, end] = onTextSelected.mock.calls[0];
    expect(rawContent.slice(start, end)).toBe(
      "配置和分词器很小，但**必须一起下**，否则权重加载不了。"
    );
  });
});
