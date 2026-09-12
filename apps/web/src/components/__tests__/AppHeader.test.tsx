import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { InMemoryStorageAdapter, TreeStore } from "@asktree/core";

const mocks = vi.hoisted(() => ({ ctx: {} as Record<string, unknown> }));

vi.mock("../../hooks/useTree", () => ({ useTree: () => mocks.ctx }));

import { AppHeader } from "../AppHeader";

describe("AppHeader brand", () => {
  it("renders the two-tone AskTree logo with an icon", () => {
    mocks.ctx = {
      store: new TreeStore(new InMemoryStorageAdapter()),
      importBundle: vi.fn(),
      exportBundle: vi.fn(),
      createRootTree: vi.fn(),
      resetTree: vi.fn(),
    };

    const { container } = render(
      <AppHeader onSettings={() => {}} onToggleSidebar={() => {}} />,
    );

    expect(container.querySelector(".app-brand-icon")).toBeTruthy();
    // Ask and Tree share one inline wrapper so the flex gap does not split the wordmark.
    const wordmark = container.querySelector(".app-brand-text");
    expect(wordmark?.querySelector(".app-brand-ask")?.textContent).toBe("Ask");
    expect(wordmark?.querySelector(".app-brand-tree")?.textContent).toBe("Tree");
  });

  it("suggests the root article title as the default export filename", async () => {
    const store = new TreeStore(new InMemoryStorageAdapter());
    await store.createTree("content", "My Article");

    mocks.ctx = {
      store,
      importBundle: vi.fn(),
      exportBundle: vi.fn().mockResolvedValue({
        version: 1,
        tree: { version: 1, rootNodeId: "root", nodes: {}, createdAt: 0, updatedAt: 0 },
        contents: {},
      }),
      createRootTree: vi.fn(),
      resetTree: vi.fn(),
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
