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

  it("should call onTextSelected when text is selected and floating button is clicked", async () => {
    const onTextSelected = vi.fn();

    const { container } = render(
      <MarkdownPane content="Hello World" onTextSelected={onTextSelected} />
    );

    // Wait for innerHTML to be set via useEffect
    await act(async () => {
      await new Promise((r) => setTimeout(r, 10));
    });

    const contentDiv = container.querySelector(".markdown-pane > div")!;
    // The paragraph inside the rendered markdown
    const p = contentDiv.querySelector("p")!;
    const textNode = p.firstChild!; // The text node "Hello World"

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

    // Simulate mouseup after selecting text
    fireEvent.mouseUp(document);

    await act(async () => {
      await new Promise((r) => setTimeout(r, 10));
    });

    const floatingBtn = container.querySelector(".floating-ask");
    expect(floatingBtn).toBeTruthy();

    fireEvent.mouseDown(floatingBtn!);

    expect(onTextSelected).toHaveBeenCalledTimes(1);
    expect(onTextSelected).toHaveBeenCalledWith("Hello", expect.any(Number), expect.any(Number));
  });
});
