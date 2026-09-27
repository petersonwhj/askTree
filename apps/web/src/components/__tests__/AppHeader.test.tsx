import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

const mocks = vi.hoisted(() => ({ ctx: {} as Record<string, unknown> }));

vi.mock("../../hooks/useTree", () => ({ useTree: () => mocks.ctx }));

vi.mock("../../lib/import-docx", () => ({
  docxToMarkdown: vi.fn(async () => "# Converted"),
}));

import { AppHeader } from "../AppHeader";

const baseCtx = () => ({
  activeTreeId: "t1" as string | null,
  trees: [{ id: "t1", title: "My Article", updatedAt: 0 }],
  createDocument: vi.fn(),
  importDocument: vi.fn(),
  exportDocument: vi.fn(),
});

describe("AppHeader brand", () => {
  it("renders the two-tone AskTree logo with an icon", () => {
    mocks.ctx = baseCtx();

    const { container } = render(
      <AppHeader onSettings={() => {}} onToggleSidebar={() => {}} />,
    );

    expect(container.querySelector(".app-brand-icon")).toBeTruthy();
    // Ask and Tree share one inline wrapper so the flex gap does not split the wordmark.
    const wordmark = container.querySelector(".app-brand-text");
    expect(wordmark?.querySelector(".app-brand-ask")?.textContent).toBe("Ask");
    expect(wordmark?.querySelector(".app-brand-tree")?.textContent).toBe("Tree");
  });

  it("suggests the active document title as the default export filename", async () => {
    mocks.ctx = {
      ...baseCtx(),
      exportDocument: vi.fn().mockResolvedValue({
        version: 1,
        tree: { version: 1, rootNodeId: "root", nodes: {}, createdAt: 0, updatedAt: 0 },
        contents: {},
      }),
    };

    const write = vi.fn().mockResolvedValue(undefined);
    const close = vi.fn().mockResolvedValue(undefined);
    const createWritable = vi.fn().mockResolvedValue({ write, close });
    const showSaveFilePicker = vi.fn().mockResolvedValue({ createWritable });
    Object.defineProperty(window, "showSaveFilePicker", {
      configurable: true,
      value: showSaveFilePicker,
    });

    render(<AppHeader onSettings={() => {}} onToggleSidebar={() => {}} />);
    fireEvent.click(screen.getByRole("button", { name: /export/i }));

    await waitFor(() =>
      expect(showSaveFilePicker).toHaveBeenCalledWith(
        expect.objectContaining({ suggestedName: "My Article.json" }),
      ),
    );

    delete (window as unknown as { showSaveFilePicker?: unknown }).showSaveFilePicker;
  });
});

describe("AppHeader forest actions", () => {
  it("exports the active document", async () => {
    const exportDocument = vi.fn().mockResolvedValue({ version: 1, tree: {}, contents: {} });
    mocks.ctx = { ...baseCtx(), activeTreeId: "t1", exportDocument };
    Object.defineProperty(URL, "createObjectURL", { configurable: true, value: vi.fn(() => "blob:mock") });
    Object.defineProperty(URL, "revokeObjectURL", { configurable: true, value: vi.fn() });
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});

    render(<AppHeader onSettings={() => {}} onToggleSidebar={() => {}} />);
    fireEvent.click(screen.getByRole("button", { name: /export tree/i }));

    await waitFor(() => expect(exportDocument).toHaveBeenCalledWith("t1"));
  });

  it("disables export when no document is active", () => {
    mocks.ctx = { ...baseCtx(), activeTreeId: null };

    render(<AppHeader onSettings={() => {}} onToggleSidebar={() => {}} />);
    const button = screen.getByRole("button", { name: /export tree/i }) as HTMLButtonElement;
    expect(button.disabled).toBe(true);
  });

  it("appends an imported document instead of replacing", async () => {
    const importDocument = vi.fn();
    mocks.ctx = { ...baseCtx(), importDocument };

    const { container } = render(<AppHeader onSettings={() => {}} onToggleSidebar={() => {}} />);
    const input = container.querySelector('input[accept=".json,.zip"]') as HTMLInputElement;
    const json = '{"version":1,"tree":{"nodes":{}},"contents":{}}';
    const file = new File([json], "tree.json", { type: "application/json" });
    Object.defineProperty(file, "arrayBuffer", {
      value: async () => new TextEncoder().encode(json).buffer,
    });
    fireEvent.change(input, { target: { files: [file] } });

    await waitFor(() => expect(importDocument).toHaveBeenCalled());
  });

  it("has no clear button", () => {
    mocks.ctx = baseCtx();

    render(<AppHeader onSettings={() => {}} onToggleSidebar={() => {}} />);
    expect(screen.queryByTitle(/clear current tree/i)).toBeNull();
  });

  it("opens a .docx as a docx document", async () => {
    const createDocument = vi.fn();
    mocks.ctx = { ...baseCtx(), createDocument };

    const { container } = render(<AppHeader onSettings={() => {}} onToggleSidebar={() => {}} />);
    const input = container.querySelector(
      'header input[accept=".md,.markdown,.txt,.docx,.pdf"]',
    ) as HTMLInputElement;
    expect(input).toBeTruthy();
    fireEvent.change(input, { target: { files: [new File(["x"], "My Article.docx")] } });

    await waitFor(() => expect(createDocument).toHaveBeenCalledWith("# Converted", "My Article", "docx"));
  });
});
