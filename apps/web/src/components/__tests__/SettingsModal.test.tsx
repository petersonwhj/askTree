import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { DEFAULT_PROMPT_CONFIG } from "@asktree/core";

const mocks = vi.hoisted(() => ({ ctx: {} as Record<string, unknown> }));

vi.mock("../../hooks/useTree", () => ({ useTree: () => mocks.ctx }));

import { SettingsModal } from "../SettingsModal";

describe("SettingsModal providers", () => {
  beforeEach(() => {
    localStorage.clear();
    mocks.ctx = {
      llm: { getConfig: () => null, configure: vi.fn() },
      promptConfig: DEFAULT_PROMPT_CONFIG,
      setPromptConfig: vi.fn(),
    };
  });

  it("offers only Ollama, OpenAI-compatible, and Anthropic providers", () => {
    render(<SettingsModal onClose={() => {}} />);

    expect(screen.getByRole("button", { name: /ollama/i })).toBeTruthy();
    expect(screen.getByRole("button", { name: /openai compatible api/i })).toBeTruthy();
    expect(screen.getByRole("button", { name: /anthropic compatible api/i })).toBeTruthy();

    expect(screen.queryByText(/glean/i)).toBeNull();
    expect(screen.queryByText(/custom gateway/i)).toBeNull();
  });

  it("migrates an obsolete saved provider to OpenAI-compatible", () => {
    localStorage.setItem("asktree_provider", "glean");

    render(<SettingsModal onClose={() => {}} />);

    const openai = screen.getByRole("button", { name: /openai compatible api/i });
    expect(openai.getAttribute("aria-pressed")).toBe("true");
  });

  it("keeps the API key hidden by default and toggles visibility with the eye", () => {
    localStorage.setItem("asktree_provider", "openai");
    render(<SettingsModal onClose={() => {}} />);

    const input = screen.getByPlaceholderText("sk-...") as HTMLInputElement;
    expect(input.type).toBe("password");

    fireEvent.click(screen.getByRole("button", { name: /show api key/i }));
    expect(input.type).toBe("text");

    fireEvent.click(screen.getByRole("button", { name: /hide api key/i }));
    expect(input.type).toBe("password");
  });
});
