import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render } from "@testing-library/react";

const mocks = vi.hoisted(() => ({
  ctx: {} as Record<string, unknown>,
}));

vi.mock("../../hooks/useTree", () => ({
  useTree: () => mocks.ctx,
}));

import { ClipBridge } from "../ClipBridge";

function fakeChrome() {
  const listeners: Array<(message: unknown) => void> = [];
  const chrome = {
    runtime: {
      id: "test",
      onMessage: {
        addListener: (fn: (message: unknown) => void) => listeners.push(fn),
        removeListener: (fn: (message: unknown) => void) => {
          const i = listeners.indexOf(fn);
          if (i >= 0) listeners.splice(i, 1);
        },
      },
    },
    storage: {
      session: { get: vi.fn(async () => ({})), set: vi.fn(async () => {}) },
    },
  };
  return { chrome, listeners };
}

describe("ClipBridge notices", () => {
  const setLoadNotice = vi.fn();

  beforeEach(() => {
    setLoadNotice.mockClear();
    mocks.ctx = { createDocument: vi.fn(), setLoadNotice, isLoading: false };
    window.history.replaceState({}, "", "/");
  });

  afterEach(() => {
    delete (globalThis as { chrome?: unknown }).chrome;
  });

  it("shows a notice the extension pushes to an already-open tab", () => {
    const { chrome, listeners } = fakeChrome();
    (globalThis as { chrome?: unknown }).chrome = chrome;
    render(<ClipBridge />);
    expect(listeners).toHaveLength(1);
    listeners[0]({ type: "asktree-notice", message: "Download the PDF first." });
    expect(setLoadNotice).toHaveBeenCalledWith("Download the PDF first.");
  });

  it("ignores unrelated messages", () => {
    const { chrome, listeners } = fakeChrome();
    (globalThis as { chrome?: unknown }).chrome = chrome;
    render(<ClipBridge />);
    listeners[0]({ type: "something-else" });
    listeners[0](undefined);
    expect(setLoadNotice).not.toHaveBeenCalled();
  });

  it("stops listening when unmounted", () => {
    const { chrome, listeners } = fakeChrome();
    (globalThis as { chrome?: unknown }).chrome = chrome;
    const { unmount } = render(<ClipBridge />);
    unmount();
    expect(listeners).toHaveLength(0);
  });
});
