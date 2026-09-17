import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";
import { InMemoryStorageAdapter, TreeStore, DEFAULT_PROMPT_CONFIG } from "@asktree/core";
import type { Node } from "@asktree/core";

const mocks = vi.hoisted(() => ({
  ctx: {} as Record<string, unknown>,
}));

vi.mock("../../hooks/useTree", () => ({
  useTree: () => mocks.ctx,
}));

import { DualPanel } from "../DualPanel";

describe("DualPanel prompt debug trigger", () => {
  const question = "Explain more about hydration.";

  beforeEach(async () => {
    const store = new TreeStore(new InMemoryStorageAdapter());
    const root = await store.createTree("hydration is key to interactivity.", "Hydration");
    const child = await store.addChild(
      root.id,
      { selectedText: "hydration", startPos: 0, endPos: 9, question },
      "Hydration is the process where a server-rendered page becomes interactive.",
    );

    mocks.ctx = {
      store,
      llm: {},
      activePath: [root, child] as Node[],
      selectedText: null,
      setSelectedText: vi.fn(),
      addChildNode: vi.fn(),
      updateStatus: vi.fn(),
      promptConfig: DEFAULT_PROMPT_CONFIG,
      createRootTree: vi.fn(),
      navigateTo: vi.fn(),
      focusNode: vi.fn(),
      navigateUp: vi.fn(),
      isLoading: false,
      showExplored: true,
    };
  });

  it("places a ? trigger to the left of the page title and opens prompt debug", async () => {
    const { container } = render(<DualPanel />);

    const trigger = await screen.findByLabelText("Show prompt debug");
    const title = trigger.parentElement?.querySelector(".panel-title") ?? null;

    expect(title?.textContent).toBe(question);
    // Trigger must come before the title in document order (left of it visually)
    expect(
      trigger.compareDocumentPosition(title!) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();

    fireEvent.click(trigger);
    await waitFor(() => expect(container.querySelector(".prompt-debug-question")?.textContent).toBe(question));
  });

  it("offers a working prompt debug trigger for a generated page shown in the left panel", async () => {
    const store = new TreeStore(new InMemoryStorageAdapter());
    const root = await store.createTree("root passage text", "Root");
    const q1 = await store.addChild(
      root.id,
      { selectedText: "root", startPos: 0, endPos: 4, question: "Q1?" },
      "first answer text",
    );
    const q2 = await store.addChild(
      q1.id,
      { selectedText: "first", startPos: 0, endPos: 5, question: "Q2?" },
      "second answer text",
    );
    mocks.ctx = { ...mocks.ctx, store, activePath: [root, q1, q2] };

    render(<DualPanel />);

    let triggers: HTMLElement[] = [];
    await waitFor(() => {
      triggers = screen.getAllByLabelText("Show prompt debug");
      expect(triggers).toHaveLength(2);
    });

    fireEvent.click(triggers[0]);
    await waitFor(() =>
      expect(document.querySelector(".prompt-debug-question")?.textContent).toBe("Q1?"),
    );
  });
});

describe("DualPanel panel actions and free-ask target", () => {
  const writeText = vi.fn().mockResolvedValue(undefined);
  let store: TreeStore;
  let rootId: string;
  let childId: string;

  beforeEach(async () => {
    store = new TreeStore(new InMemoryStorageAdapter());
    const root = await store.createTree("root article markdown", "Root");
    rootId = root.id;
    const child = await store.addChild(
      root.id,
      { selectedText: "root", startPos: 0, endPos: 4, question: "Q1?" },
      "first answer markdown",
    );
    childId = child.id;

    writeText.mockReset();
    writeText.mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });

    mocks.ctx = {
      store,
      llm: { ask: vi.fn(() => new Promise(() => {})) },
      activePath: [root, child] as Node[],
      selectedText: null,
      setSelectedText: vi.fn(),
      addChildNode: vi.fn(),
      updateStatus: vi.fn(),
      promptConfig: DEFAULT_PROMPT_CONFIG,
      createRootTree: vi.fn(),
      navigateTo: vi.fn(),
      focusNode: vi.fn(),
      navigateUp: vi.fn(),
      isLoading: false,
      showExplored: true,
    };
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("copies each panel's markdown source to the clipboard", async () => {
    render(<DualPanel />);

    await waitFor(() => expect(screen.getAllByLabelText("Copy markdown")).toHaveLength(2));
    fireEvent.click(screen.getAllByLabelText("Copy markdown")[0]);

    expect(writeText).toHaveBeenCalledWith("root article markdown");
  });

  it("downloads each panel's markdown as a .md file", async () => {
    const createObjectURL = vi.fn(() => "blob:mock");
    Object.defineProperty(URL, "createObjectURL", { configurable: true, value: createObjectURL });
    Object.defineProperty(URL, "revokeObjectURL", { configurable: true, value: vi.fn() });
    let downloadedName = "";
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (this: HTMLAnchorElement) {
      downloadedName = this.download;
    });

    render(<DualPanel />);

    await waitFor(() => expect(screen.getAllByLabelText("Download markdown")).toHaveLength(2));
    fireEvent.click(screen.getAllByLabelText("Download markdown")[0]);

    expect(createObjectURL).toHaveBeenCalledTimes(1);
    expect(downloadedName).toBe("Root.md");
  });

  it("attaches a free-ask question to the left page when Left is selected", async () => {
    render(<DualPanel />);
    await waitFor(() => expect(screen.getAllByLabelText("Copy markdown")).toHaveLength(2));

    fireEvent.click(screen.getByRole("button", { name: /◀\s*left/i }));
    fireEvent.change(screen.getByPlaceholderText(/ask anything/i), { target: { value: "free q" } });
    fireEvent.click(screen.getByRole("button", { name: /^send$/i }));

    await waitFor(() => {
      const root = store.getNode(rootId)!;
      expect(root.children.some((e) => e.question === "free q")).toBe(true);
    });
  });

  it("shows a green copied state on the Copy button after clicking", async () => {
    render(<DualPanel />);
    await waitFor(() => expect(screen.getAllByLabelText("Copy markdown")).toHaveLength(2));

    fireEvent.click(screen.getAllByLabelText("Copy markdown")[0]);

    await waitFor(() => {
      const copied = document.querySelector(".panel-icon-btn.copied");
      expect(copied).toBeTruthy();
      expect(copied?.getAttribute("aria-label")).toBe("Copied");
    });
  });

  it("renders the empty state when there is no current node", () => {
    mocks.ctx = { ...mocks.ctx, activePath: [], selectedText: null };
    render(<DualPanel />);
    expect(screen.getByText(/Welcome to AskTree/i)).toBeTruthy();
  });

  it("starts a tree from a markdown file opened in the empty state", async () => {
    const createRootTree = vi.fn().mockResolvedValue(undefined);
    mocks.ctx = { ...mocks.ctx, activePath: [], selectedText: null, createRootTree };
    render(<DualPanel />);

    const clickSpy = vi.spyOn(HTMLInputElement.prototype, "click").mockImplementation(() => {});
    fireEvent.click(screen.getByRole("button", { name: /open markdown file/i }));
    expect(clickSpy).toHaveBeenCalledTimes(1);

    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    expect(input?.accept).toContain(".md");

    const file = new File(["# Hi\n\nbody"], "My Article.md", { type: "text/markdown" });
    // jsdom does not implement Blob.text(), which real browsers provide.
    Object.defineProperty(file, "text", { value: () => Promise.resolve("# Hi\n\nbody") });
    fireEvent.change(input, { target: { files: [file] } });

    await waitFor(() => expect(createRootTree).toHaveBeenCalledWith("# Hi\n\nbody", "My Article"));
  });

  it("refreshes explored marks immediately after an off-path deletion", async () => {
    // A sibling edge on the parent that is not on the active path.
    const sibling = await store.addChild(
      rootId,
      { selectedText: "article", startPos: 5, endPos: 12, question: "sib" },
      "sib content",
    );

    const { container, rerender } = render(<DualPanel />);
    await waitFor(() =>
      expect(container.querySelector(".asktree-explored")?.textContent).toContain("article"),
    );

    await act(async () => {
      await store.removeNode(sibling.id);
    });
    mocks.ctx = { ...mocks.ctx, treeVersion: ((mocks.ctx.treeVersion as number) ?? 0) + 1 };
    rerender(<DualPanel />);

    await waitFor(() => expect(container.querySelector(".asktree-explored")).toBeNull());
  });

  it("shows the raw selection slice from the panel it was made in", async () => {
    const childText = "first answer markdown";
    const start = childText.indexOf("answer");
    const end = start + "answer".length;
    mocks.ctx = {
      ...mocks.ctx,
      selectedText: { text: "answer", start, end, nodeId: childId },
    };

    const { container } = render(<DualPanel />);

    await waitFor(() => expect(container.querySelector(".context-badge")).toBeTruthy());
    const badge = container.querySelector(".context-badge")!.textContent ?? "";
    expect(badge).toContain("answer");
    // The old code sliced the parent content at the same offsets → "articl".
    expect(badge).not.toContain("articl");
  });

  it("labels a selection from the right panel", async () => {
    mocks.ctx = {
      ...mocks.ctx,
      selectedText: { text: "hydration", start: 0, end: 9, nodeId: childId },
    };
    render(<DualPanel />);
    expect(await screen.findByText("Right panel")).toBeTruthy();
  });

  it("labels a selection from the left panel", async () => {
    mocks.ctx = {
      ...mocks.ctx,
      selectedText: { text: "root", start: 0, end: 4, nodeId: rootId },
    };
    render(<DualPanel />);
    expect(await screen.findByText("Left panel")).toBeTruthy();
  });

  it("generates suggestions from the current context and asks a chosen one", async () => {
    const ask = vi.fn().mockResolvedValue("1. Why?\n2. How?\n3. When?");
    mocks.ctx = {
      ...mocks.ctx,
      llm: { ask, getConfig: () => ({ endpoint: "http://x", model: "m" }) },
    };

    render(<DualPanel />);
    await waitFor(() => expect(screen.getAllByLabelText("Copy markdown")).toHaveLength(2));

    fireEvent.click(screen.getByRole("button", { name: /suggest a question/i }));
    fireEvent.click(await screen.findByText("Why?"));

    // Free-ask default target is the current (right) node.
    await waitFor(() => {
      const current = store.getNode(childId)!;
      expect(current.children.some((e) => e.question === "Why?")).toBe(true);
    });
  });
});
