import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { InMemoryStorageAdapter, TreeStore, DEFAULT_PROMPT_CONFIG } from "@asktree/core";

const mocks = vi.hoisted(() => ({
  store: undefined as unknown as TreeStore,
  promptConfig: undefined as unknown as typeof DEFAULT_PROMPT_CONFIG,
}));

vi.mock("../../hooks/useTree", () => ({
  useTree: () => ({ store: mocks.store, promptConfig: mocks.promptConfig }),
}));

import { PromptDebugModal } from "../PromptDebugModal";

describe("PromptDebugModal", () => {
  let childId: string;
  const question = "Explain more about the concept please.";
  const writeText = vi.fn().mockResolvedValue(undefined);

  beforeEach(async () => {
    const store = new TreeStore(new InMemoryStorageAdapter());
    const root = await store.createTree("hydration is key to interactivity.", "Hydration");
    const child = await store.addChild(
      root.id,
      { selectedText: "hydration", startPos: 0, endPos: 9, question },
      "Hydration is the process where a server-rendered page becomes interactive.",
    );
    childId = child.id;
    mocks.store = store;
    mocks.promptConfig = DEFAULT_PROMPT_CONFIG;

    writeText.mockReset();
    writeText.mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      value: { writeText },
      configurable: true,
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("shows the question as subtitle and renders SYSTEM/USER prompt sections", async () => {
    const { container } = render(<PromptDebugModal nodeId={childId} onClose={() => {}} />);

    await waitFor(() => expect(screen.getByText("Prompt Debug")).toBeTruthy());

    expect(container.querySelector(".prompt-debug-question")?.textContent).toBe(question);
    expect(screen.getByText("SYSTEM")).toBeTruthy();
    expect(screen.getByText("USER")).toBeTruthy();

    const system = container.querySelector(".prompt-debug-system")?.textContent ?? "";
    const user = container.querySelector(".prompt-debug-user")?.textContent ?? "";
    expect(system).toContain("study assistant");
    expect(user).toContain(question);
  });

  it("rebuilds the prompt from the source page, not from the answer itself", async () => {
    const { container } = render(<PromptDebugModal nodeId={childId} onClose={() => {}} />);

    await waitFor(() =>
      expect(container.querySelector(".prompt-debug-user")?.textContent).toBeTruthy(),
    );
    const user = container.querySelector(".prompt-debug-user")!.textContent ?? "";

    // Generation used the parent (source) page's content …
    expect(user).toContain("key to interactivity");
    // … not the answer that this node holds.
    expect(user).not.toContain("server-rendered page becomes interactive");
  });

  it("copies the combined system and user prompt from the single Copy button", async () => {
    render(<PromptDebugModal nodeId={childId} onClose={() => {}} />);

    await screen.findByText("SYSTEM");
    fireEvent.click(screen.getByRole("button", { name: /copy/i }));

    expect(writeText).toHaveBeenCalledTimes(1);
    const copied = writeText.mock.calls[0][0] as string;
    expect(copied).toContain("study assistant");
    expect(copied).toContain(question);
  });
});
