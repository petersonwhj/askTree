import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { InMemoryStorageAdapter, TreeStore } from "@asktree/core";
import type { Node } from "@asktree/core";

const mocks = vi.hoisted(() => ({ ctx: {} as Record<string, unknown> }));
vi.mock("../../hooks/useTree", () => ({ useTree: () => mocks.ctx }));

import { TreeSidebar } from "../TreeSidebar";

describe("TreeSidebar (forest)", () => {
  let alpha: TreeStore;

  beforeEach(async () => {
    const adapterA = new InMemoryStorageAdapter();
    alpha = new TreeStore(adapterA, "alpha");
    const alphaRoot = await alpha.createTree("# Alpha", "Alpha");
    await alpha.addChild(
      alphaRoot.id,
      { selectedText: "a", startPos: 0, endPos: 1, question: "A child?" },
      "answer",
    );

    mocks.ctx = {
      store: alpha,
      trees: [
        { id: "alpha", title: "Alpha", updatedAt: 1, kind: "markdown" },
        { id: "beta", title: "Beta", updatedAt: 2, kind: "docx" },
      ],
      activeTreeId: "alpha",
      setActiveTree: vi.fn(),
      renameDocument: vi.fn(),
      exportDocument: vi.fn(),
      deleteDocument: vi.fn(),
      createDocument: vi.fn(),
      activePath: [alpha.getRoot()] as Node[],
      focusNode: vi.fn(),
      removeNode: vi.fn(),
    };
  });

  it("lists every document and highlights the active one", () => {
    render(<TreeSidebar />);
    expect(screen.getByText("Documents")).toBeTruthy();
    expect(screen.getByTestId("doc-row-alpha").className).toContain("active");
    expect(screen.getByTestId("doc-row-beta").className).not.toContain("active");
  });

  it("shows the document title once, without a duplicate root node", () => {
    render(<TreeSidebar />);
    // The row already represents the root; the subtree must start at its children.
    expect(screen.getAllByText("Alpha")).toHaveLength(1);
  });

  it("marks the document kind, badging only non-markdown documents", () => {
    render(<TreeSidebar />);
    expect(screen.getByTestId("doc-row-alpha").getAttribute("data-kind")).toBe("markdown");
    expect(screen.getByTestId("doc-row-beta").getAttribute("data-kind")).toBe("docx");
    expect(screen.getByTestId("doc-row-beta").querySelector(".doc-kind")?.textContent).toBe("docx");
    expect(screen.getByTestId("doc-row-alpha").querySelector(".doc-kind")).toBeNull();
  });

  it("switches document when a row is clicked", () => {
    render(<TreeSidebar />);
    fireEvent.click(screen.getByTestId("doc-row-beta"));
    expect(mocks.ctx.setActiveTree).toHaveBeenCalledWith("beta");
  });

  it("expands the active document's subtree by default and collapses on toggle", async () => {
    render(<TreeSidebar />);
    expect(await screen.findByText("A child?")).toBeTruthy();
    fireEvent.click(screen.getByLabelText("Toggle Alpha"));
    await waitFor(() => expect(screen.queryByText("A child?")).toBeNull());
  });

  it("renames a document inline", () => {
    render(<TreeSidebar />);
    fireEvent.click(screen.getByLabelText("Rename Beta"));
    const input = screen.getByDisplayValue("Beta");
    fireEvent.change(input, { target: { value: "Beta v2" } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(mocks.ctx.renameDocument).toHaveBeenCalledWith("beta", "Beta v2");
  });

  it("exports a document", () => {
    render(<TreeSidebar />);
    fireEvent.click(screen.getByLabelText("Export Beta"));
    expect(mocks.ctx.exportDocument).toHaveBeenCalledWith("beta");
  });

  it("asks for confirmation before deleting a document", async () => {
    render(<TreeSidebar />);
    fireEvent.click(screen.getByLabelText("Delete Beta"));
    const confirm = await screen.findByRole("button", { name: /^delete$/i });
    fireEvent.click(confirm);
    await waitFor(() => expect(mocks.ctx.deleteDocument).toHaveBeenCalledWith("beta"));
  });

  it("starts a new document from the New control", () => {
    render(<TreeSidebar />);
    fireEvent.click(screen.getByLabelText("New document"));
    expect(mocks.ctx.setActiveTree).toHaveBeenCalledWith(null);
  });
});
